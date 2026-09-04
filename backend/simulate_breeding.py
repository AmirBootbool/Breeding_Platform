import os
import django
import datetime
import random

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.core.models import Program, Location, Season
from apps.germplasm.models import Germplasm, Cross
from apps.trials.models import Trial, ObservationVariable, Observation, Plot

def assign_sowing_map(trial):
    plots = list(trial.plots.all().order_by('rep', 'plot_number'))
    rep_counts = {}
    for plot in plots:
        rep = plot.rep
        plot.block = rep
        plot.row = rep
        rep_counts[rep] = rep_counts.get(rep, 0) + 1
        plot.column = rep_counts[rep]
        plot.save()

def phenotype_trial(trial, vars_dict, start_hd, hd_range):
    for plot in trial.plots.all():
        y = round(random.uniform(0.0, 5.0), 2)
        Observation.objects.create(plot=plot, variable=vars_dict['yield'], value_numeric=y)
        Observation.objects.create(plot=plot, variable=vars_dict['disease'], value_numeric=random.randint(0, 5))
        Observation.objects.create(plot=plot, variable=vars_dict['lodging'], value_numeric=random.randint(0, 5))
        hd = start_hd + datetime.timedelta(days=random.randint(0, hd_range))
        Observation.objects.create(plot=plot, variable=vars_dict['heading'], value_date=hd)
        p = round(random.uniform(0.0, 18.0), 2)
        Observation.objects.create(plot=plot, variable=vars_dict['protein'], value_numeric=p)

def select_best_lines(trial, vars_dict, top_k):
    germplasm_stats = {}
    
    plots = trial.plots.all().prefetch_related('observations')
    for plot in plots:
        g = plot.germplasm
        if g not in germplasm_stats:
            germplasm_stats[g] = {'yield': [], 'protein': []}
        
        for obs in plot.observations.all():
            if obs.variable_id == vars_dict['yield'].id:
                germplasm_stats[g]['yield'].append(obs.value_numeric)
            elif obs.variable_id == vars_dict['protein'].id:
                germplasm_stats[g]['protein'].append(obs.value_numeric)
                
    ranking = []
    for g, stats in germplasm_stats.items():
        avg_y = sum(stats['yield'])/len(stats['yield']) if stats['yield'] else 0
        avg_p = sum(stats['protein'])/len(stats['protein']) if stats['protein'] else 0
        ranking.append((g, avg_y, avg_p))
        
    # Sort primarily by average yield, secondarily by protein
    ranking.sort(key=lambda x: (x[1], x[2]), reverse=True)
    return [x[0] for x in ranking[:top_k]]

def run_simulation():
    print("Starting breeding cycle simulation...")

    # 0. Cleanup previous simulation data
    print("Cleaning up previous simulation data...")
    Trial.objects.filter(trial_code__startswith="SIM-").delete()
    Cross.objects.filter(cross_code__startswith="SIM-").delete()
    Germplasm.objects.filter(name__startswith="Line ").delete()
    Program.objects.filter(name="Simulation Program").delete()
    Location.objects.filter(name="Simulation Station").delete()
    ObservationVariable.objects.filter(name__in=["Yield", "Disease Resistance", "Lodging Severity", "Heading Date", "Protein"]).delete()
    
    # 1. Setup core data
    program, _ = Program.objects.get_or_create(
        name="Simulation Program",
        defaults={"crop": "wheat", "description": "Program for simulation"}
    )
    location, _ = Location.objects.get_or_create(
        name="Simulation Station",
        defaults={"country": "USA", "region": "Midwest", "latitude": 40.0, "longitude": -90.0}
    )
    season, _ = Season.objects.get_or_create(
        year=2026,
        program=program,
        defaults={"name": "Spring 2026"}
    )
    
    yield_var, _ = ObservationVariable.objects.get_or_create(name="Yield", defaults={"data_type": "numeric", "unit": "kg", "min_value": 0.0, "max_value": 5.0})
    disease_var, _ = ObservationVariable.objects.get_or_create(name="Disease Resistance", defaults={"data_type": "integer", "min_value": 0, "max_value": 5})
    lodging_var, _ = ObservationVariable.objects.get_or_create(name="Lodging Severity", defaults={"data_type": "integer", "min_value": 0, "max_value": 5})
    heading_var, _ = ObservationVariable.objects.get_or_create(name="Heading Date", defaults={"data_type": "date"})
    protein_var, _ = ObservationVariable.objects.get_or_create(name="Protein", defaults={"data_type": "numeric", "unit": "%", "min_value": 0.0, "max_value": 18.0})
    
    vars_dict = {
        'yield': yield_var,
        'disease': disease_var,
        'lodging': lodging_var,
        'heading': heading_var,
        'protein': protein_var
    }
    
    start_hd = datetime.date(2026, 2, 1)
    end_hd = datetime.date(2026, 3, 15)
    hd_range = (end_hd - start_hd).days

    # 2. Create 4 base lines in the germplasm bank
    lines = []
    for i in range(1, 5):
        line, created = Germplasm.objects.get_or_create(
            name=f"Line {i}",
            program=program,
            defaults={"cross_type": "inbred"}
        )
        if created:
            print(f"Created base line: {line.name}")
        lines.append(line)

    # 3. Cross all lines with each other (diallel without selfs/reciprocals)
    print("\n[Generation F1] Crossing lines...")
    f1_germplasms = []
    cross_idx = 1
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            female = lines[i]
            male = lines[j]
            cross_code = f"SIM-2026-{cross_idx:03d}"
            
            cross, _ = Cross.objects.get_or_create(
                cross_code=cross_code,
                defaults={"female_parent": female, "male_parent": male, "cross_date": datetime.date.today(), "location": location}
            )
            
            f1_name = f"{female.name}/{male.name} F1"
            f1, _ = Germplasm.objects.get_or_create(
                name=f1_name, program=program,
                defaults={"parent_female": female, "parent_male": male, "pedigree_string": f"{female.name}/{male.name}", "cross_type": "biparental"}
            )
            if f1 not in f1_germplasms:
                f1_germplasms.append(f1)
            
            cross_idx += 1
    
    f1_trial, f1_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F1-FIELD",
        defaults={"name": "Simulation F1 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 1}
    )
    if f1_t_created:
        f1_trial.create_plots(entries=f1_germplasms)
    print(f"F1 Field created with {len(f1_germplasms)} plots.")

    # 4. F1 to F2
    print("\n[Generation F2] Advancing F1s to F2s...")
    f2_germplasms = []
    for f1 in f1_germplasms:
        f2_name = f"{f1.pedigree_string} F2"
        f2, _ = Germplasm.objects.get_or_create(
            name=f2_name, program=program,
            defaults={"parent_female": f1, "parent_male": f1, "pedigree_string": f2_name, "cross_type": "self"}
        )
        if f2 not in f2_germplasms:
            f2_germplasms.append(f2)

    f2_trial, f2_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F2-FIELD",
        defaults={"name": "Simulation F2 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 1}
    )
    if f2_t_created:
        f2_trial.create_plots(entries=f2_germplasms)
    print(f"F2 Field created with {len(f2_germplasms)} plots.")

    # 5. F2 to F3 (Select 20 plants per plot to ensure enough lines for F6)
    print("\n[Generation F3] Selecting 20 plants from each F2 plot...")
    f3_germplasms = []
    for f2 in f2_germplasms:
        for i in range(1, 21):
            f3_name = f"{f2.pedigree_string}-{i}"
            f3, _ = Germplasm.objects.get_or_create(
                name=f3_name, program=program,
                defaults={"parent_female": f2, "parent_male": f2, "pedigree_string": f3_name, "cross_type": "self"}
            )
            f3_germplasms.append(f3)
            
    f3_trial, f3_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F3-FIELD",
        defaults={"name": "Simulation F3 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 1}
    )
    if f3_t_created:
        f3_trial.create_plots(entries=f3_germplasms)
    print(f"F3 Field created with {len(f3_germplasms)} plots.")

    # 6. F3 to F4 (Random 70% selection)
    f3_select_count = int(len(f3_germplasms) * 0.7)
    print(f"\n[Generation F4] Randomly selecting {f3_select_count} of {len(f3_germplasms)} F3 plots (70%)...")
    f3_selected = random.sample(f3_germplasms, f3_select_count)
    
    f4_germplasms = []
    for f3 in f3_selected:
        f4_name = f"{f3.pedigree_string} F4"
        f4, _ = Germplasm.objects.get_or_create(
            name=f4_name, program=program,
            defaults={"parent_female": f3, "parent_male": f3, "pedigree_string": f4_name, "cross_type": "self"}
        )
        f4_germplasms.append(f4)
        
    f4_trial, f4_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F4-FIELD",
        defaults={"name": "Simulation F4 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 1}
    )
    if f4_t_created:
        f4_trial.create_plots(entries=f4_germplasms)
    print(f"F4 Field created with {len(f4_germplasms)} plots.")

    # 7. F4 to F5 (Random 70% selection)
    f4_select_count = int(len(f4_germplasms) * 0.7)
    print(f"\n[Generation F5] Randomly selecting {f4_select_count} of {len(f4_germplasms)} F4 plots (70%)...")
    f4_selected = random.sample(f4_germplasms, f4_select_count)
    
    f5_germplasms = []
    for f4 in f4_selected:
        f5_name = f"{f4.pedigree_string} F5"
        f5, _ = Germplasm.objects.get_or_create(
            name=f5_name, program=program,
            defaults={"parent_female": f4, "parent_male": f4, "pedigree_string": f5_name, "cross_type": "self"}
        )
        f5_germplasms.append(f5)

    f5_trial, f5_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F5-FIELD",
        defaults={"name": "Simulation F5 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 1}
    )
    if f5_t_created:
        f5_trial.create_plots(entries=f5_germplasms)
    print(f"F5 Field created with {len(f5_germplasms)} plots.")

    # 8. Observations in F5
    print("\n[Phenotyping F5] Generating random trait data for F5...")
    phenotype_trial(f5_trial, vars_dict, start_hd, hd_range)

    # 9. F5 to F6 (Select top 30% by yield/protein)
    f5_select_count = int(len(f5_germplasms) * 0.3)
    print(f"\n[Generation F6] Selecting top {f5_select_count} of {len(f5_germplasms)} F5 plots (30%) based on Yield...")
    f5_selected = select_best_lines(f5_trial, vars_dict, f5_select_count)
    
    f6_germplasms = []
    for f5 in f5_selected:
        f6_name = f"{f5.pedigree_string} F6"
        f6, _ = Germplasm.objects.get_or_create(
            name=f6_name, program=program,
            defaults={"parent_female": f5, "parent_male": f5, "pedigree_string": f6_name, "cross_type": "self"}
        )
        f6_germplasms.append(f6)

    # Create F6 field with RCBD, 6 reps, sowing map, and phenotypes
    f6_trial, f6_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F6-FIELD",
        defaults={"name": "Simulation F6 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 6}
    )
    if f6_t_created:
        f6_trial.create_plots(entries=f6_germplasms)
        assign_sowing_map(f6_trial)
        
    print(f"F6 Field created with {len(f6_germplasms)} lines across 6 reps ({f6_trial.plots.count()} plots) and assigned sowing map.")
    
    print("\n[Phenotyping F6] Generating random trait data for F6 plots...")
    phenotype_trial(f6_trial, vars_dict, start_hd, hd_range)

    # 10. F6 to F7 (Promote top 10 based on average yield and protein)
    print(f"\n[Generation F7] Selecting top 10 F6 lines based on average yield and protein...")
    f6_selected = select_best_lines(f6_trial, vars_dict, 10)
    
    f7_germplasms = []
    for f6 in f6_selected:
        f7_name = f"{f6.pedigree_string} F7"
        f7, _ = Germplasm.objects.get_or_create(
            name=f7_name, program=program,
            defaults={"parent_female": f6, "parent_male": f6, "pedigree_string": f7_name, "cross_type": "self"}
        )
        f7_germplasms.append(f7)

    # Create F7 field with RCBD, 6 reps, sowing map, and phenotypes
    f7_trial, f7_t_created = Trial.objects.get_or_create(
        trial_code="SIM-F7-FIELD",
        defaults={"name": "Simulation F7 Field", "program": program, "location": location, "season": season, "design_type": "RCBD", "num_reps": 6}
    )
    if f7_t_created:
        f7_trial.create_plots(entries=f7_germplasms)
        assign_sowing_map(f7_trial)
        
    print(f"F7 Field created with {len(f7_germplasms)} lines across 6 reps ({f7_trial.plots.count()} plots) and assigned sowing map.")
    
    print("\n[Phenotyping F7] Generating random trait data for F7 plots...")
    phenotype_trial(f7_trial, vars_dict, start_hd, hd_range)
    
    # 11. Final selection from F7
    print(f"\n[Final Selection] Selecting top 3 F7 lines based on average yield and protein...")
    f7_selected = select_best_lines(f7_trial, vars_dict, 3)
    
    for rank, line in enumerate(f7_selected, 1):
        print(f"Rank {rank}: {line.name}")

    print("\nBreeding cycle simulation complete!")

if __name__ == "__main__":
    run_simulation()
