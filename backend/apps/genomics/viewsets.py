import csv
import io
import json
import logging
from typing import Any, Dict

import numpy as np
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg
from django.http import HttpResponse

from apps.core.models import Program
from apps.core.permissions import RoleBasedPermission
from apps.germplasm.models import Germplasm
from apps.trials.models import AnalysisSet, Observation, ObservationVariable, Trial

from .models import (
    DiagnosticMarker,
    GenomicBreedingValue,
    GenomicPrediction,
    GenotypeDataset,
    GenotypeSample,
    MarkerScore,
)
from .serializers import (
    DiagnosticMarkerSerializer,
    GenomicBreedingValueSerializer,
    GenomicPredictionSerializer,
    GenotypeDatasetSerializer,
    GenotypeSampleSerializer,
    MarkerScoreSerializer,
)
from .services import (
    compute_mas_stacking_matrix,
    compute_vanraden_grm,
    fit_gblup_solver,
    parse_hapmap_stream,
    parse_matrix_stream,
    parse_vcf_stream,
    qc_and_impute_matrix,
    run_k_fold_cross_validation,
    seed_default_wheat_markers,
)

logger = logging.getLogger("apps.genomics.viewsets")


class GenotypeDatasetViewSet(viewsets.ModelViewSet):
    queryset = GenotypeDataset.objects.all().select_related("program", "created_by")
    serializer_class = GenotypeDatasetSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    filterset_fields = ["program", "file_format", "imputation_method"]
    search_fields = ["name", "species", "description"]
    ordering_fields = ["name", "created_at", "marker_count", "sample_count"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={201: GenotypeDatasetSerializer},
        description="Upload a genotype file (VCF, HapMap, or CSV matrix) and parse into a GenotypeDataset.",
    )
    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_file(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"error": "No file uploaded. Please provide 'file' in multipart form data."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = request.data.get("name") or file_obj.name.rsplit(".", 1)[0]
        program_id = request.data.get("program")
        if not program_id:
            return Response(
                {"error": "Field 'program' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            program = Program.objects.get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"error": "Program not found."}, status=status.HTTP_404_NOT_FOUND
            )

        file_format = request.data.get("file_format", "matrix").lower()
        imputation = request.data.get("imputation_method", "mean")
        try:
            maf_thresh = float(request.data.get("maf_threshold", 0.05))
        except (ValueError, TypeError):
            maf_thresh = 0.05

        species = request.data.get("species", "Triticum aestivum")
        description = request.data.get("description", "")

        try:
            # Read file stream as text
            content = file_obj.read().decode("utf-8", errors="replace")
            stream = io.StringIO(content)

            if file_format == "vcf" or file_obj.name.lower().endswith(".vcf"):
                file_format = "vcf"
                m_names, s_names, raw_matrix = parse_vcf_stream(stream)
            elif file_format == "hapmap" or "hmp" in file_obj.name.lower():
                file_format = "hapmap"
                m_names, s_names, raw_matrix = parse_hapmap_stream(stream)
            else:
                file_format = "matrix"
                m_names, s_names, raw_matrix = parse_matrix_stream(stream)

            # Quality control & Imputation
            cleaned_mat, retained_m, retained_s, qc_stats = qc_and_impute_matrix(
                raw_matrix,
                m_names,
                s_names,
                maf_threshold=maf_thresh,
                imputation=imputation,
            )

            # Store dosage matrix as JSON dictionary: sample_id -> [dosages]
            matrix_dict = {
                s_name: [round(float(v), 2) for v in cleaned_mat[idx, :]]
                for idx, s_name in enumerate(retained_s)
            }

            with transaction.atomic():
                dataset = GenotypeDataset.objects.create(
                    name=name,
                    program=program,
                    species=species,
                    file_format=file_format,
                    marker_count=len(retained_m),
                    sample_count=len(retained_s),
                    marker_names=retained_m,
                    sample_names=retained_s,
                    imputation_method=imputation,
                    maf_threshold=maf_thresh,
                    matrix_data=matrix_dict,
                    description=description,
                    created_by=request.user,
                )

                # Link samples to existing Germplasm where name or germplasm_db_id matches
                existing_germplasm = {
                    g.name.lower(): g
                    for g in Germplasm.objects.filter(program=program)
                }
                existing_db_ids = {
                    g.germplasm_db_id.lower(): g
                    for g in Germplasm.objects.filter(program=program)
                    if g.germplasm_db_id
                }

                samples_to_create = []
                for s_name in retained_s:
                    germ = existing_germplasm.get(s_name.lower()) or existing_db_ids.get(
                        s_name.lower()
                    )
                    samples_to_create.append(
                        GenotypeSample(
                            dataset=dataset,
                            sample_id=s_name,
                            germplasm=germ,
                            call_rate=qc_stats.get("mean_call_rate", 1.0),
                        )
                    )

                GenotypeSample.objects.bulk_create(samples_to_create)

            return Response(
                {
                    "dataset": GenotypeDatasetSerializer(dataset).data,
                    "qc_stats": qc_stats,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as exc:
            logger.error("Genotype file upload failed: %s", exc, exc_info=True)
            return Response(
                {"error": f"Failed to process genotype file: {str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
        description="Compute and return the Genomic Relationship Matrix (VanRaden G-matrix) with PCA coordinates.",
    )
    @action(detail=True, methods=["get"])
    def grm_matrix(self, request, pk=None):
        dataset = self.get_object()
        sample_names = dataset.sample_names
        matrix_data = dataset.matrix_data

        if not sample_names or not matrix_data:
            return Response(
                {"error": "Dataset does not contain valid dosage matrix data."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reconstruct dosage matrix
        matrix_rows = []
        valid_samples = []
        for s in sample_names:
            if s in matrix_data:
                matrix_rows.append(matrix_data[s])
                valid_samples.append(s)

        if not matrix_rows:
            return Response(
                {"error": "No sample dosage vectors found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        M = np.array(matrix_rows, dtype=float)
        G = compute_vanraden_grm(M, lambda_shrinkage=0.01)

        # Compute 2D PCA on G for visualization
        try:
            eigvals, eigvecs = np.linalg.eigh(G)
            idx = np.argsort(eigvals)[::-1]
            eigvecs = eigvecs[:, idx]
            pca_coords = eigvecs[:, :2] * np.sqrt(np.maximum(0, eigvals[idx[:2]]))
            pca_list = [
                {
                    "sample_id": valid_samples[i],
                    "pc1": round(float(pca_coords[i, 0]), 4),
                    "pc2": round(float(pca_coords[i, 1]), 4),
                }
                for i in range(len(valid_samples))
            ]
        except Exception:
            pca_list = []

        # Heatmap slice (up to 40 samples for visual clarity)
        max_heat = min(40, len(valid_samples))
        heat_samples = valid_samples[:max_heat]
        heat_matrix = [
            [round(float(G[i, j]), 3) for j in range(max_heat)]
            for i in range(max_heat)
        ]

        return Response({
            "sample_count": len(valid_samples),
            "marker_count": dataset.marker_count,
            "samples": valid_samples,
            "pca_coordinates": pca_list,
            "heatmap": {
                "samples": heat_samples,
                "matrix": heat_matrix,
            },
        })


class GenomicPredictionViewSet(viewsets.ModelViewSet):
    queryset = GenomicPrediction.objects.all().select_related(
        "program",
        "trait",
        "genotype_dataset",
        "training_trial",
        "training_analysis_set",
        "created_by",
    )
    serializer_class = GenomicPredictionSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    filterset_fields = ["program", "trait", "model_type", "status"]
    search_fields = ["name", "trait__name", "genotype_dataset__name"]
    ordering_fields = ["name", "created_at", "cv_accuracy", "genomic_heritability"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={201: OpenApiTypes.OBJECT},
        description="Run GBLUP genomic prediction for a trait using field trial or analysis set observations.",
    )
    @action(detail=False, methods=["post"])
    def run_prediction(self, request):
        name = request.data.get("name")
        program_id = request.data.get("program")
        trait_id = request.data.get("trait")
        genotype_dataset_id = request.data.get("genotype_dataset")
        trial_id = request.data.get("training_trial")
        analysis_set_id = request.data.get("training_analysis_set")
        heritability_prior = float(request.data.get("heritability_prior", 0.50))
        k_folds = int(request.data.get("k_folds", 5))

        if not name or not program_id or not trait_id or not genotype_dataset_id:
            return Response(
                {
                    "error": "Required fields: 'name', 'program', 'trait', 'genotype_dataset'."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not trial_id and not analysis_set_id:
            return Response(
                {
                    "error": "Provide either 'training_trial' or 'training_analysis_set' for training data."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            program = Program.objects.get(id=program_id)
            trait = ObservationVariable.objects.get(id=trait_id)
            dataset = GenotypeDataset.objects.get(id=genotype_dataset_id)
            trial = Trial.objects.get(id=trial_id) if trial_id else None
            analysis_set = (
                AnalysisSet.objects.get(id=analysis_set_id)
                if analysis_set_id
                else None
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        # 1. Fetch phenotypic observations
        obs_qs = Observation.objects.filter(
            variable=trait, value_numeric__isnull=False
        ).select_related("plot", "plot__germplasm")

        if trial:
            obs_qs = obs_qs.filter(plot__trial=trial)
        elif analysis_set:
            obs_qs = obs_qs.filter(plot__trial__in=analysis_set.trials.all())

        pheno_agg = (
            obs_qs.values("plot__germplasm__name", "plot__germplasm__germplasm_db_id", "plot__germplasm_id")
            .annotate(mean_val=Avg("value_numeric"))
        )

        phenotype_dict: Dict[str, float] = {}
        germplasm_obj_map: Dict[str, int] = {}

        for row in pheno_agg:
            name_key = row["plot__germplasm__name"]
            db_id_key = row["plot__germplasm__germplasm_db_id"]
            val = float(row["mean_val"])
            g_id = row["plot__germplasm_id"]

            if name_key:
                phenotype_dict[name_key] = val
                germplasm_obj_map[name_key] = g_id
            if db_id_key:
                phenotype_dict[db_id_key] = val
                germplasm_obj_map[db_id_key] = g_id

        # Also map all dataset samples to germplasm in DB
        sample_links = GenotypeSample.objects.filter(dataset=dataset).select_related(
            "germplasm"
        )
        for s in sample_links:
            if s.germplasm_id:
                germplasm_obj_map[s.sample_id] = s.germplasm_id

        sample_names = dataset.sample_names
        matrix_data = dataset.matrix_data

        if not sample_names or not matrix_data:
            return Response(
                {"error": "Genotype dataset does not contain matrix data."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        matrix_rows = [matrix_data[s] for s in sample_names if s in matrix_data]
        valid_samples = [s for s in sample_names if s in matrix_data]

        if len(valid_samples) < 3:
            return Response(
                {"error": "Insufficient valid samples in dataset."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        M = np.array(matrix_rows, dtype=float)
        G = compute_vanraden_grm(M, lambda_shrinkage=0.01)

        try:
            # 2. Run Cross-Validation
            cv_res = run_k_fold_cross_validation(
                phenotype_dict,
                valid_samples,
                G,
                k_folds=k_folds,
                heritability_prior=heritability_prior,
            )

            # 3. Fit GBLUP on entire dataset
            fit_res = fit_gblup_solver(
                phenotype_dict,
                valid_samples,
                G,
                heritability_prior=heritability_prior,
            )

            with transaction.atomic():
                prediction = GenomicPrediction.objects.create(
                    name=name,
                    program=program,
                    trait=trait,
                    genotype_dataset=dataset,
                    training_trial=trial,
                    training_analysis_set=analysis_set,
                    model_type="gblup",
                    n_training=fit_res["n_training"],
                    n_candidates=fit_res["n_candidates"],
                    cv_accuracy=cv_res.get("cv_accuracy"),
                    cv_mse=cv_res.get("cv_mse"),
                    genomic_heritability=fit_res.get("heritability_snp"),
                    variance_genomic=fit_res.get("variance_genomic"),
                    variance_residual=fit_res.get("variance_residual"),
                    status="completed",
                    created_by=request.user,
                )

                # Ensure Germplasm records exist for all lines or create placeholders
                existing_germ = {
                    g.name: g for g in Germplasm.objects.filter(program=program)
                }

                gebv_objects = []
                for row in fit_res["line_results"]:
                    s_id = row["sample_id"]
                    germ_id = germplasm_obj_map.get(s_id)
                    germ_obj = None

                    if germ_id:
                        germ_obj = Germplasm.objects.filter(id=germ_id).first()
                    if not germ_obj:
                        germ_obj = existing_germ.get(s_id)
                    if not germ_obj:
                        # Create candidate germplasm record
                        germ_obj = Germplasm.objects.create(
                            name=s_id,
                            program=program,
                            cross_type="unknown",
                            notes="Auto-created from Genotype sample",
                        )
                        existing_germ[s_id] = germ_obj

                    gebv_objects.append(
                        GenomicBreedingValue(
                            prediction=prediction,
                            germplasm=germ_obj,
                            sample_id=s_id,
                            gebv=row["gebv"],
                            reliability=row["reliability"],
                            standard_error=row["standard_error"],
                            rank=row["rank"],
                            is_training=row["is_training"],
                            observed_phenotype=row["observed_phenotype"],
                        )
                    )

                GenomicBreedingValue.objects.bulk_create(gebv_objects)

            return Response(
                {
                    "prediction": GenomicPredictionSerializer(prediction).data,
                    "cross_validation": cv_res,
                    "top_candidates": GenomicBreedingValueSerializer(
                        gebv_objects[:10], many=True
                    ).data,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as exc:
            logger.error("Genomic prediction run failed: %s", exc, exc_info=True)
            return Response(
                {"error": f"Genomic prediction failed: {str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @extend_schema(
        responses={200: GenomicBreedingValueSerializer(many=True)},
        description="Fetch GEBVs for this prediction session with search and filtering.",
    )
    @action(detail=True, methods=["get"])
    def gebvs(self, request, pk=None):
        prediction = self.get_object()
        qs = GenomicBreedingValue.objects.filter(
            prediction=prediction
        ).select_related("germplasm", "germplasm__program")

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                models_or_q := (
                    Germplasm.objects.filter(
                        name__icontains=search
                    ).values_list("id", flat=True)
                )
            )

        is_training = request.query_params.get("is_training")
        if is_training is not None and is_training != "":
            is_train_bool = is_training.lower() in ("true", "1")
            qs = qs.filter(is_training=is_train_bool)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = GenomicBreedingValueSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = GenomicBreedingValueSerializer(qs, many=True)
        return Response(serializer.data)

    @extend_schema(
        responses={200: OpenApiTypes.BINARY},
        description="Download all GEBVs for this prediction as a CSV file.",
    )
    @action(detail=True, methods=["get"])
    def export_gebv_csv(self, request, pk=None):
        prediction = self.get_object()
        gebvs = (
            GenomicBreedingValue.objects.filter(prediction=prediction)
            .select_related("germplasm")
            .order_by("rank")
        )

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="gebvs_{prediction.id}_{prediction.trait.name}.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([
            "Rank",
            "Sample_ID",
            "Germplasm_Name",
            "Germplasm_DB_ID",
            "GEBV",
            "Reliability",
            "Standard_Error",
            "Is_Training_Set",
            "Observed_Phenotype",
        ])

        for g in gebvs:
            writer.writerow([
                g.rank,
                g.sample_id,
                g.germplasm.name,
                g.germplasm.germplasm_db_id,
                g.gebv,
                g.reliability,
                g.standard_error or "",
                "Yes" if g.is_training else "No",
                g.observed_phenotype if g.observed_phenotype is not None else "",
            ])

        return response


class DiagnosticMarkerViewSet(viewsets.ModelViewSet):
    queryset = DiagnosticMarker.objects.all().select_related("program")
    serializer_class = DiagnosticMarkerSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    filterset_fields = ["program", "trait_category", "assay_type"]
    search_fields = ["name", "gene_symbol", "target_trait", "chromosome"]
    ordering_fields = ["name", "trait_category", "chromosome", "created_at"]
    ordering = ["trait_category", "name"]

    @extend_schema(
        responses={200: DiagnosticMarkerSerializer(many=True)},
        description="Seed standard wheat functional markers (Lr34, Fhb1, Rht-B1, etc.).",
    )
    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        program_id = request.data.get("program_id")
        program = Program.objects.filter(id=program_id).first() if program_id else None
        created = seed_default_wheat_markers(program=program)
        all_markers = DiagnosticMarker.objects.all()
        return Response(
            {
                "seeded_count": len(created),
                "total_markers": all_markers.count(),
                "markers": DiagnosticMarkerSerializer(all_markers, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class MarkerScoreViewSet(viewsets.ModelViewSet):
    queryset = MarkerScore.objects.all().select_related("marker", "germplasm")
    serializer_class = MarkerScoreSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    filterset_fields = ["marker", "germplasm", "call_status"]
    search_fields = ["marker__name", "germplasm__name", "raw_genotype"]
    ordering_fields = ["updated_at", "marker__name"]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
        description="Fetch complete Lines x Markers matrix with MAS Stacking Index.",
    )
    @action(detail=False, methods=["get"])
    def stacking_overview(self, request):
        program_id = request.query_params.get("program")
        germplasm_ids_raw = request.query_params.get("germplasm_ids")

        germplasm_ids = None
        if germplasm_ids_raw:
            try:
                germplasm_ids = [
                    int(x.strip()) for x in germplasm_ids_raw.split(",") if x.strip()
                ]
            except ValueError:
                pass

        p_id = int(program_id) if program_id and program_id.isdigit() else None
        res = compute_mas_stacking_matrix(
            germplasm_ids=germplasm_ids, program_id=p_id
        )
        return Response(res)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT},
        description="Batch update MAS marker scores for multiple germplasm accessions.",
    )
    @action(detail=False, methods=["post"])
    def batch_score(self, request):
        scores_data = request.data.get("scores", [])
        if not isinstance(scores_data, list):
            return Response(
                {"error": "Expected 'scores' as a list of score objects."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        with transaction.atomic():
            for item in scores_data:
                marker_id = item.get("marker_id")
                germplasm_id = item.get("germplasm_id")
                call_status = item.get("call_status", "missing")
                raw_gt = item.get("raw_genotype", "")
                notes = item.get("notes", "")

                if not marker_id or not germplasm_id:
                    continue

                MarkerScore.objects.update_or_create(
                    marker_id=marker_id,
                    germplasm_id=germplasm_id,
                    defaults={
                        "call_status": call_status,
                        "raw_genotype": raw_gt,
                        "notes": notes,
                    },
                )
                updated_count += 1

        return Response(
            {"status": "success", "updated_count": updated_count},
            status=status.HTTP_200_OK,
        )
