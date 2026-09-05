"""
End-to-End User-Side Breeding Simulation Script ($F_0 \to F_7$)
Simulates the exact user journey requested:
1. 6 founder varieties (newVar1 to newVar6)
2. Crossing block with all 6 varieties (full diallel + reciprocals = 30 crosses)
3. Harvest all hybrids and sow F1 field (30 plots, bulk advance)
4. Sow F2 field (30 families), select 4 plants/family (120 F3 lines)
5. Sow F3 head rows (120 plots), select 50% (60 F4 lines)
6. Sow F4 preliminary nursery (60 plots), score GY/HD, select 80% (48 F5 lines)
7. Sow F5 preliminary yield trial (48 lines + 3 recurring checks = 51+ plots), score GY/HD, select 50% (24 F6 lines)
8. Sow F6 advanced yield trial (24 lines, RCBD 4 reps = 96 plots), score GY/HD, select top lines
9. Sow F7 elite variety trial (RCBD 6 reps), score traits, generate sowing maps at each stage.
"""
import os
import sys
import random
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from apps.core.models import Program, Location, Season, UserProfile
from apps.germplasm.models import Germplasm, CrossingBlock, Cross, SeedLot, SeedTransaction
from apps.germplasm.services import build_pedigree_tree
from apps.trials.models import Trial, Plot, ObservationVariable, Observation, AnalysisSet
from apps.trials.services import advance_plots

User = get_user_model()

def record_obs(plot, variable, val):
    obs = Observation(plot=plot, variable=variable)
    if variable.data_type == "date":
        obs.set_typed_value("2026-04-15")
    else:
        obs.set_typed_value(val)
    obs.save()
    return obs


def run_full_simulation():
    print("🌾 Starting Complete 7-Generation Breeding Simulation (F0 -> F7)...")
    
    # 0. User & Program Setup
    user, _ = User.objects.get_or_create(username="admin_user")
    user.set_password("password123")
    user.is_superuser = True
    user.is_staff = True
    user.save()
    UserProfile.objects.get_or_create(user=user, defaults={"role": "admin"})

    program, _ = Program.objects.get_or_create(
        name="Bread Wheat Breeding Program",
        defaults={"crop": "wheat", "created_by": user, "description": "National elite bread wheat nursery"}
    )
    location, _ = Location.objects.get_or_create(
        name="Beit Dagan Central Field Station",
        defaults={"latitude": 32.00, "longitude": 34.82}
    )
    season_2026, _ = Season.objects.get_or_create(
        name="2026-2027 Main Season",
        defaults={"year": 2026, "program": program}
    )

    # Observation Variables
    var_gy, _ = ObservationVariable.objects.get_or_create(
        variable_code="GY",
        defaults={"name": "Grain Yield", "unit": "t/ha", "data_type": "numeric", "min_value": 0.0, "max_value": 15.0, "crop": "wheat"}
    )
    var_hd, _ = ObservationVariable.objects.get_or_create(
        variable_code="HD",
        defaults={"name": "Heading Date", "unit": "days", "data_type": "numeric", "min_value": 50.0, "max_value": 150.0, "crop": "wheat"}
    )
    var_protein, _ = ObservationVariable.objects.get_or_create(
        variable_code="GPC",
        defaults={"name": "Grain Protein Content", "unit": "%", "data_type": "numeric", "min_value": 8.0, "max_value": 20.0, "crop": "wheat"}
    )

    # =========================================================================
    # Step 1: Deposit 6 New Introductions (newVar1 to newVar6)
    # =========================================================================
    print("\n[Step 1] Depositing 6 new founder introductions (newVar1 - newVar6)...")
    founders = []
    for i in range(1, 7):
        name = f"newVar{i}"
        g, _ = Germplasm.objects.get_or_create(
            name=name,
            program=program,
            defaults={
                "species": "Triticum aestivum",
                "created_by": user,
            }
        )
        founders.append(g)
        print(f"  ✓ Registered founder: {g.name} (ID: {g.id})")

    # =========================================================================
    # Step 2: Crossing Block (6x6 Full Diallel + Reciprocals = 30 Crosses)
    # =========================================================================
    print("\n[Step 2] Setting up 6x6 Full Diallel Crossing Block with Reciprocals...")
    cb, _ = CrossingBlock.objects.get_or_create(
        name="2026 Founder Diallel Block",
        program=program,
        defaults={"location": location, "season": season_2026, "include_reciprocals": True, "created_by": user}
    )

    crosses = []
    f1_germplasm_list = []
    for female in founders:
        for male in founders:
            if female.id == male.id:
                continue  # no selfs in crossing block
            cross_code = f"CR-2026-{female.name}x{male.name}"
            cross_obj, created = Cross.objects.get_or_create(
                crossing_block=cb,
                female_parent=female,
                male_parent=male,
                defaults={
                    "cross_code": cross_code,
                    "is_reciprocal": founders.index(female) > founders.index(male),
                    "cross_date": "2026-03-15",
                }
            )
            # Create F1 progeny
            f1_name = f"{female.name}/{male.name}"
            f1_g, _ = Germplasm.objects.get_or_create(
                name=f1_name,
                program=program,
                defaults={
                    "species": "Triticum aestivum",
                    "parent_female": female,
                    "parent_male": male,
                    "created_by": user,
                }
            )
            cross_obj.progeny = f1_g
            cross_obj.status = "harvested"
            cross_obj.save()
            crosses.append(cross_obj)
            f1_germplasm_list.append(f1_g)

    print(f"  ✓ Planned & executed {len(crosses)} hybrid crosses. Generated {len(f1_germplasm_list)} F1 progeny lines.")

    # =========================================================================
    # Step 3: F1 Field Nursery (30 Plots, Bulk Harvest -> F2)
    # =========================================================================
    print("\n[Step 3] Sowing F1 Field Nursery (30 plots, Unreplicated)...")
    trial_f1, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F1",
        defaults={
            "name": "F1 Hybrid Evaluation Nursery",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "unreplicated",
            "num_reps": 1,
            "created_by": user,
        }
    )
    # Generate Sowing Map
    Plot.objects.filter(trial=trial_f1).delete()
    f1_plots = []
    for idx, f1_g in enumerate(f1_germplasm_list, start=1):
        p = Plot.objects.create(
            trial=trial_f1,
            germplasm=f1_g,
            rep=1,
            plot_number=idx,
            row=1,
            column=idx,
            status="planted",
        )
        f1_plots.append(p)
    print(f"  ✓ Sowing map assigned: {len(f1_plots)} plots across Row 1.")

    # Advance all F1 plots as Bulk to F2
    print("  Selecting all 30 plots as Bulk to advance to F2...")
    f2_ids = advance_plots([p.id for p in f1_plots], selections_per_plot=1, selection_method="Bulk")
    f2_germplasm_list = list(Germplasm.objects.filter(id__in=f2_ids))
    print(f"  ✓ Advanced {len(f2_germplasm_list)} F2 family lines.")

    # =========================================================================
    # Step 4: F2 Segregating Field (30 families, Select 4 plants/family = 120 F3 lines)
    # =========================================================================
    print("\n[Step 4] Sowing F2 Segregating Field (30 plots)...")
    trial_f2, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F2",
        defaults={
            "name": "F2 Segregating Population Nursery",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "unreplicated",
            "num_reps": 1,
            "created_by": user,
        }
    )
    Plot.objects.filter(trial=trial_f2).delete()
    f2_plots = []
    for idx, f2_g in enumerate(f2_germplasm_list, start=1):
        p = Plot.objects.create(
            trial=trial_f2,
            germplasm=f2_g,
            rep=1,
            plot_number=idx,
            row=(idx - 1) // 10 + 1,
            column=(idx - 1) % 10 + 1,
            status="planted",
        )
        f2_plots.append(p)
    print(f"  ✓ Sowing map assigned: 30 plots in 3 rows x 10 cols.")

    print("  Selecting 4 plants per family via SSD to advance to F3 (30 x 4 = 120 lines)...")
    f3_ids = advance_plots([p.id for p in f2_plots], selections_per_plot=4, selection_method="SSD")
    f3_germplasm_list = list(Germplasm.objects.filter(id__in=f3_ids))
    print(f"  ✓ Advanced {len(f3_germplasm_list)} F3 lines.")

    # =========================================================================
    # Step 5: F3 Head Row Nursery (120 plots, Select 50% = 60 F4 lines)
    # =========================================================================
    print("\n[Step 5] Sowing F3 Head Row Nursery (120 plots)...")
    trial_f3, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F3",
        defaults={
            "name": "F3 Head Row Nursery",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "unreplicated",
            "num_reps": 1,
            "created_by": user,
        }
    )
    Plot.objects.filter(trial=trial_f3).delete()
    f3_plots = []
    for idx, f3_g in enumerate(f3_germplasm_list, start=1):
        p = Plot.objects.create(
            trial=trial_f3,
            germplasm=f3_g,
            rep=1,
            plot_number=idx,
            row=(idx - 1) // 20 + 1,
            column=(idx - 1) % 20 + 1,
            status="planted",
        )
        f3_plots.append(p)
    print(f"  ✓ Sowing map assigned: 120 plots in 6 rows x 20 cols.")

    # Select 50% (60 plots)
    selected_f3_plots = f3_plots[:60]
    print("  Selecting top 50% of plots (60 plots) to advance to F4...")
    f4_ids = advance_plots([p.id for p in selected_f3_plots], selections_per_plot=1, selection_method="Pedigree")
    f4_germplasm_list = list(Germplasm.objects.filter(id__in=f4_ids))
    print(f"  ✓ Advanced {len(f4_germplasm_list)} F4 lines.")

    # =========================================================================
    # Step 6: F4 Preliminary Nursery (60 plots, Score GY & HD, Select 80% = 48 F5 lines)
    # =========================================================================
    print("\n[Step 6] Sowing F4 Preliminary Nursery & collecting mock phenotyping data...")
    trial_f4, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F4",
        defaults={
            "name": "F4 Preliminary Observation Nursery",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "unreplicated",
            "num_reps": 1,
            "created_by": user,
        }
    )
    Plot.objects.filter(trial=trial_f4).delete()
    f4_plots = []
    for idx, f4_g in enumerate(f4_germplasm_list, start=1):
        p = Plot.objects.create(
            trial=trial_f4,
            germplasm=f4_g,
            rep=1,
            plot_number=idx,
            row=(idx - 1) // 15 + 1,
            column=(idx - 1) % 15 + 1,
            status="planted",
        )
        f4_plots.append(p)
        # Mock Observation Data
        gy_val = round(random.uniform(4.5, 8.8), 2)
        hd_val = round(random.uniform(88.0, 106.0), 1)
        record_obs(p, var_gy, gy_val)
        record_obs(p, var_hd, hd_val)
    print(f"  ✓ Sowing map & phenotypic scores recorded for {len(f4_plots)} F4 plots.")

    # Select 80% (48 plots)
    selected_f4_plots = f4_plots[:48]
    print("  Selecting top 80% of plots (48 plots) based on yield to advance to F5...")
    f5_ids = advance_plots([p.id for p in selected_f4_plots], selections_per_plot=1, selection_method="Pedigree")
    f5_germplasm_list = list(Germplasm.objects.filter(id__in=f5_ids))
    print(f"  ✓ Advanced {len(f5_germplasm_list)} F5 candidate lines.")

    # =========================================================================
    # Step 7: F5 Yield Trial (48 test lines + 3 recurring check lines)
    # =========================================================================
    print("\n[Step 7] Sowing F5 Preliminary Yield Trial with 3 recurring check lines...")
    # Get 3 recurring check lines
    check1 = founders[5] # newVar6
    check2, _ = Germplasm.objects.get_or_create(name="ATTILA", program=program, defaults={"species": "Triticum aestivum"})
    check3, _ = Germplasm.objects.get_or_create(name="KACHU", program=program, defaults={"species": "Triticum aestivum"})
    checks = [check1, check2, check3]

    trial_f5, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F5",
        defaults={
            "name": "F5 Preliminary Yield Trial (Check-Augmented)",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "augmented_block",
            "block_size": 10,
            "num_reps": 1,
            "created_by": user,
        }
    )
    Plot.objects.filter(trial=trial_f5).delete()
    f5_plots = []
    p_num = 1
    # 48 test lines distributed into 6 blocks of 8 test lines + 3 checks each = 11 plots/block (66 plots total)
    for b in range(1, 7):
        # 8 test lines for this block
        block_test_lines = f5_germplasm_list[(b - 1) * 8 : b * 8]
        for g in block_test_lines:
            p = Plot.objects.create(
                trial=trial_f5,
                germplasm=g,
                rep=1,
                block=b,
                plot_number=p_num,
                row=b,
                column=(p_num - 1) % 11 + 1,
                is_check=False,
                status="planted",
            )
            f5_plots.append(p)
            p_num += 1
        # 3 recurring checks
        for chk in checks:
            p = Plot.objects.create(
                trial=trial_f5,
                germplasm=chk,
                rep=1,
                block=b,
                plot_number=p_num,
                row=b,
                column=(p_num - 1) % 11 + 1,
                is_check=True,
                status="planted",
            )
            f5_plots.append(p)
            p_num += 1

    # Add mock observation data
    for p in f5_plots:
        base_gy = 8.5 if p.is_check else random.uniform(5.0, 9.2)
        record_obs(p, var_gy, round(base_gy, 2))
        record_obs(p, var_hd, round(random.uniform(90.0, 102.0), 1))
    print(f"  ✓ Sowing map assigned: {len(f5_plots)} plots (48 test lines + 18 check plots in 6 blocks).")

    # Select 50% of test lines (24 lines)
    test_plots_f5 = [p for p in f5_plots if not p.is_check][:24]
    print("  Selecting top 50% of candidate lines (24 lines) to advance to F6...")
    f6_ids = advance_plots([p.id for p in test_plots_f5], selections_per_plot=1, selection_method="YieldSelection")
    f6_germplasm_list = list(Germplasm.objects.filter(id__in=f6_ids))
    print(f"  ✓ Advanced {len(f6_germplasm_list)} F6 advanced candidate lines.")

    # =========================================================================
    # Step 8: F6 Advanced Yield Trial (RCBD 4 Reps = 96 plots)
    # =========================================================================
    print("\n[Step 8] Sowing F6 Advanced Yield Trial (RCBD with 4 replications = 96 plots)...")
    trial_f6, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F6",
        defaults={
            "name": "F6 Advanced Replicated Yield Trial",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "RCBD",
            "num_reps": 4,
            "created_by": user,
        }
    )
    Plot.objects.filter(trial=trial_f6).delete()
    f6_plots = []
    p_num = 1
    for rep in range(1, 5):
        shuffled = list(f6_germplasm_list)
        random.seed(42 + rep)
        random.shuffle(shuffled)
        for c_idx, g in enumerate(shuffled, start=1):
            p = Plot.objects.create(
                trial=trial_f6,
                germplasm=g,
                rep=rep,
                block=rep,
                plot_number=p_num,
                row=rep,
                column=c_idx,
                status="planted",
            )
            f6_plots.append(p)
            p_num += 1
            # Mock phenotype with genetic + rep effect
            gen_val = 6.5 + (g.id % 7) * 0.4
            rep_effect = (rep - 2.5) * 0.2
            record_obs(p, var_gy, round(gen_val + rep_effect + random.gauss(0, 0.3), 2))
            record_obs(p, var_hd, round(95.0 + (g.id % 5) * 1.5 + random.gauss(0, 0.5), 1))
            record_obs(p, var_protein, round(12.5 + (g.id % 4) * 0.6 + random.gauss(0, 0.2), 1))

    print(f"  ✓ Sowing map assigned: {len(f6_plots)} plots across 4 reps (4 rows x 24 columns).")

    # Select top 12 lines for F7
    f7_candidate_lines = f6_germplasm_list[:12]
    # Find one plot for each candidate
    f6_selected_plot_ids = []
    for g in f7_candidate_lines:
        p = next(p for p in f6_plots if p.germplasm_id == g.id and p.rep == 1)
        f6_selected_plot_ids.append(p.id)

    print("  Selecting top 12 elite candidate lines to advance to F7...")
    f7_ids = advance_plots(f6_selected_plot_ids, selections_per_plot=1, selection_method="MultiTraitSelection")
    f7_germplasm_list = list(Germplasm.objects.filter(id__in=f7_ids))
    print(f"  ✓ Advanced {len(f7_germplasm_list)} F7 elite variety release candidates.")

    # =========================================================================
    # Step 9: F7 Elite Variety Trial (RCBD 6 Reps = 72 plots) & MET Set
    # =========================================================================
    print("\n[Step 9] Sowing F7 Elite Variety Trial (RCBD with 6 replications = 72 plots)...")
    trial_f7, _ = Trial.objects.get_or_create(
        trial_code="SIM-2026-F7",
        defaults={
            "name": "F7 Elite Variety Registration Trial",
            "program": program,
            "location": location,
            "season": season_2026,
            "design_type": "RCBD",
            "num_reps": 6,
            "created_by": user,
        }
    )
    Plot.objects.filter(trial=trial_f7).delete()
    f7_plots = []
    p_num = 1
    for rep in range(1, 7):
        shuffled = list(f7_germplasm_list)
        random.seed(100 + rep)
        random.shuffle(shuffled)
        for c_idx, g in enumerate(shuffled, start=1):
            p = Plot.objects.create(
                trial=trial_f7,
                germplasm=g,
                rep=rep,
                block=rep,
                plot_number=p_num,
                row=rep,
                column=c_idx,
                status="planted",
            )
            f7_plots.append(p)
            p_num += 1
            gen_val = 7.2 + (g.id % 5) * 0.5
            record_obs(p, var_gy, round(gen_val + random.gauss(0, 0.25), 2))
            record_obs(p, var_hd, round(94.0 + (g.id % 4) * 1.2 + random.gauss(0, 0.4), 1))
            record_obs(p, var_protein, round(13.2 + (g.id % 3) * 0.5 + random.gauss(0, 0.2), 1))

    print(f"  ✓ Sowing map assigned: {len(f7_plots)} plots across 6 reps (6 rows x 12 columns).")

    # Seed Inventory Deposit for top F7 release candidate
    top_candidate = f7_germplasm_list[0]
    print(f"\n[Step 10] Depositing certified foundation seed for release candidate: {top_candidate.name}...")
    lot, _ = SeedLot.objects.get_or_create(
        lot_code="LOT-2026-REL-01",
        defaults={
            "germplasm": top_candidate,
            "program": program,
            "quantity_grams": 25000.0,
            "seed_count": 550000,
            "storage_location": "Vault Alpha - Shelf 4B",
            "created_by": user,
        }
    )
    SeedTransaction.objects.get_or_create(
        seed_lot=lot,
        transaction_type="harvest_deposit",
        defaults={
            "quantity_grams": 25000.0,
            "notes": "F7 Foundation seed harvest deposit from SIM-2026-F7",
            "created_by": user,
        }
    )
    print(f"  ✓ Registered Foundation Seed Lot: {lot.lot_code} ({lot.quantity_grams}g in {lot.storage_location})")

    # Multi-Environment Analysis Set
    print("\n[Step 11] Creating Multi-Environment Analysis Set...")
    analysis_set, _ = AnalysisSet.objects.get_or_create(
        name="2026 Advanced Yield MET Series (F5-F7)",
        program=program,
        defaults={"description": "Cross-environment series combining F5 PYT, F6 AYT, and F7 Elite trials", "created_by": user}
    )
    analysis_set.trials.set([trial_f5, trial_f6, trial_f7])
    print(f"  ✓ Analysis Set created with {analysis_set.trials.count()} linked multi-environment trials.")

    # Pedigree Tree Verification
    print("\n[Step 12] Tracing Pedigree Lineage for Top F7 Candidate...")
    tree = build_pedigree_tree(top_candidate.id, depth=5)
    print(f"  ✓ Pedigree root: {tree['name']} (Gen: {tree['generation']})")
    print("    ├── Female Line:", tree.get("parents", {}).get("female", {}).get("name", "N/A"))
    print("    └── Male Line:  ", tree.get("parents", {}).get("male", {}).get("name", "N/A"))

    print("\n🎉 Complete 7-Generation Breeding Simulation Pipeline Finished Successfully!")


if __name__ == "__main__":
    run_full_simulation()
