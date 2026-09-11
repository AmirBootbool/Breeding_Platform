import io
import numpy as np
import pytest

from apps.genomics.services import (
    compute_vanraden_grm,
    parse_hapmap_stream,
    parse_matrix_stream,
    parse_vcf_stream,
    qc_and_impute_matrix,
)

SAMPLE_VCF = """##fileformat=VCFv4.2
##source=WheatBreedingPlatformTest
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tLine_1\tLine_2\tLine_3\tLine_4\tLine_5
1A\t1000\tSNP_1A_1000\tA\tG\t.\tPASS\t.\tGT\t0/0\t0/1\t1/1\t./.\t0/0
1B\t2000\tSNP_1B_2000\tC\tT\t.\tPASS\t.\tGT\t1/1\t0/1\t0/0\t1/1\t0/0
2A\t3000\tSNP_2A_3000\tG\tA\t.\tPASS\t.\tGT\t0/0\t0/0\t0/0\t0/0\t0/0
2B\t4000\tSNP_2B_4000\tT\tC\t.\tPASS\t.\tGT\t0/1\t1/1\t0/1\t0/0\t1/1
"""

SAMPLE_HAPMAP = """rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanel\tQCcode\tLine_1\tLine_2\tLine_3\tLine_4
SNP_1\tA/G\t1A\t100\t+\tNA\tNA\tNA\tNA\tNA\tQC+\tAA\tAG\tGG\tNN
SNP_2\tC/T\t1B\t200\t+\tNA\tNA\tNA\tNA\tNA\tQC+\tTT\tCT\tCC\tTT
SNP_3\tA/C\t2A\t300\t+\tNA\tNA\tNA\tNA\tNA\tQC+\tAA\tAA\tAC\tCC
"""

SAMPLE_MATRIX = """SampleID,SNP_1,SNP_2,SNP_3,SNP_4
Line_1,0,2,0,1
Line_2,1,1,0,2
Line_3,2,0,0,1
Line_4,0,2,1,0
Line_5,0,0,2,2
"""


def test_parse_vcf_stream():
    stream = io.StringIO(SAMPLE_VCF)
    marker_names, sample_names, matrix = parse_vcf_stream(stream)

    assert len(sample_names) == 5
    assert sample_names == ["Line_1", "Line_2", "Line_3", "Line_4", "Line_5"]
    assert len(marker_names) == 4
    assert marker_names[0] == "SNP_1A_1000"

    # Shape is (n_samples, n_markers) = (5, 4)
    assert matrix.shape == (5, 4)
    assert matrix[0, 0] == 0.0  # Line_1, SNP_1 (0/0)
    assert matrix[1, 0] == 1.0  # Line_2, SNP_1 (0/1)
    assert matrix[2, 0] == 2.0  # Line_3, SNP_1 (1/1)
    assert np.isnan(matrix[3, 0])  # Line_4, SNP_1 (./.)


def test_parse_hapmap_stream():
    stream = io.StringIO(SAMPLE_HAPMAP)
    marker_names, sample_names, matrix = parse_hapmap_stream(stream)

    assert len(sample_names) == 4
    assert sample_names == ["Line_1", "Line_2", "Line_3", "Line_4"]
    assert len(marker_names) == 3
    assert matrix.shape == (4, 3)
    assert matrix[0, 0] == 0.0  # AA (ref/ref)
    assert matrix[1, 0] == 1.0  # AG (het)
    assert matrix[2, 0] == 2.0  # GG (alt/alt)
    assert np.isnan(matrix[3, 0])  # NN (missing)


def test_parse_matrix_stream():
    stream = io.StringIO(SAMPLE_MATRIX)
    marker_names, sample_names, matrix = parse_matrix_stream(stream)

    assert len(sample_names) == 5
    assert len(marker_names) == 4
    assert matrix.shape == (5, 4)
    assert matrix[0, 1] == 2.0


def test_qc_and_imputation():
    stream = io.StringIO(SAMPLE_VCF)
    m_names, s_names, raw_mat = parse_vcf_stream(stream)

    cleaned_mat, ret_m, ret_s, stats = qc_and_impute_matrix(
        raw_mat, m_names, s_names, maf_threshold=0.05, imputation="mean"
    )

    # Monomorphic SNP_2A_3000 (all 0) should be dropped by MAF threshold
    assert "SNP_2A_3000" not in ret_m
    assert len(ret_s) == 5
    assert not np.isnan(cleaned_mat).any()  # Imputed, no NaNs left


def test_compute_vanraden_grm():
    stream = io.StringIO(SAMPLE_MATRIX)
    m_names, s_names, matrix = parse_matrix_stream(stream)

    G = compute_vanraden_grm(matrix, lambda_shrinkage=0.01)

    assert G.shape == (5, 5)
    # Check symmetry
    np.testing.assert_allclose(G, G.T, atol=1e-5)
    # Check positive diagonal
    assert np.all(np.diag(G) > 0)
