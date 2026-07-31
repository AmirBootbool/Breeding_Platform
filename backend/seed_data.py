import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import Program, Location, Season, UserProfile
from apps.germplasm.models import Germplasm, Cross
from apps.trials.models import Trial, Plot, ObservationVariable, Observation
from django.utils import timezone
import datetime

def seed():
    print("Seeding database...")

    # Create Programs
    p1, _ = Program.objects.get_or_create(
        name="Kano Spring Wheat Program",
        defaults={"crop": "wheat", "description": "Breeding drought-tolerant and heat-tolerant spring wheat varieties for Sub-Saharan Africa."}
    )
    p2, _ = Program.objects.get_or_create(
        name="CIMMYT Bread Wheat Program",
        defaults={"crop": "wheat", "description": "Global bread wheat improvement program focusing on yield potential and rust resistance."}
    )

    # Create Locations
    l1, _ = Location.objects.get_or_create(
        name="Kano Station, Nigeria",
        defaults={"country": "Nigeria", "region": "Kano State", "latitude": 11.98, "longitude": 8.52}
    )
    l2, _ = Location.objects.get_or_create(
        name="Mexicali Station, Mexico",
        defaults={"country": "Mexico", "region": "Baja California", "latitude": 32.62, "longitude": -115.45}
    )

    # Create Seasons
    s1, _ = Season.objects.get_or_create(
        name="2026 Winter Season",
        year=2026,
        program=p1
    )
    s2, _ = Season.objects.get_or_create(
        name="2026 Spring Season",
        year=2026,
        program=p2
    )

    # Create Users
    User = get_user_model()
    u, created = User.objects.get_or_create(
        username="tester",
        defaults={
            "is_superuser": True,
            "is_staff": True,
            "email": "tester@wheatbreed.org"
        }
    )
    if created or not u.check_password("password12345"):
        u.set_password("password12345")
        u.save()
    
    up, _ = UserProfile.objects.get_or_create(
        user=u,
        defaults={"role": "admin", "program": p1}
    )
    # Ensure it is admin
    up.role = "admin"
    up.program = p1
    up.save()

    # Create Germplasm
    g_parents = []
    for name in ["KAUZ", "PASTOR", "ATTILA", "PBW343"]:
        g, _ = Germplasm.objects.get_or_create(
            name=name,
            program=p1,
            defaults={
                "species": "Triticum aestivum",
                "cross_type": "unknown",
                "year_developed": 2015,
                "notes": "Parent line used in historical crosses."
            }
        )
        g_parents.append(g)

    g1, _ = Germplasm.objects.get_or_create(
        name="KAN-WHEAT-01",
        program=p1,
        defaults={
            "species": "Triticum aestivum",
            "cross_type": "biparental",
            "year_developed": 2024,
            "parent_female": g_parents[0],
            "parent_male": g_parents[1],
            "pedigree_string": "KAUZ/PASTOR",
            "notes": "High yield potential line under heat stress."
        }
    )

    g2, _ = Germplasm.objects.get_or_create(
        name="KAN-WHEAT-02",
        program=p1,
        defaults={
            "species": "Triticum aestivum",
            "cross_type": "biparental",
            "year_developed": 2025,
            "parent_female": g_parents[2],
            "parent_male": g_parents[3],
            "pedigree_string": "ATTILA/PBW343",
            "notes": "Outstanding resistance to leaf rust."
        }
    )

    g3, _ = Germplasm.objects.get_or_create(
        name="KAN-WHEAT-03",
        program=p1,
        defaults={
            "species": "Triticum aestivum",
            "cross_type": "backcross",
            "year_developed": 2026,
            "parent_female": g1,
            "parent_male": g_parents[0],
            "pedigree_string": "KAN-WHEAT-01*2/KAUZ",
            "notes": "Backcross progeny with enhanced baking quality traits."
        }
    )

    # Create Crosses
    c1, _ = Cross.objects.get_or_create(
        cross_code="CR-KANO-2026-001",
        defaults={
            "female_parent": g1,
            "male_parent": g2,
            "cross_date": datetime.date(2026, 1, 15),
            "location": l1,
            "notes": "Biparental cross targeting combining rust resistance with drought tolerance."
        }
    )

    # Create Observation Variables
    v1, _ = ObservationVariable.objects.get_or_create(
        name="Plant height",
        defaults={
            "variable_code": "PH",
            "unit": "cm",
            "data_type": "numeric",
            "min_value": 30.0,
            "max_value": 150.0,
            "description": "Height from the soil surface to the tip of the spike (excluding awns)."
        }
    )
    v2, _ = ObservationVariable.objects.get_or_create(
        name="Grain yield",
        defaults={
            "variable_code": "GY",
            "unit": "t/ha",
            "data_type": "numeric",
            "min_value": 0.5,
            "max_value": 12.0,
            "description": "Total grain weight per plot adjusted to t/ha."
        }
    )
    v3, _ = ObservationVariable.objects.get_or_create(
        name="Rust severity",
        defaults={
            "variable_code": "RS",
            "unit": "%",
            "data_type": "numeric",
            "min_value": 0.0,
            "max_value": 100.0,
            "description": "Visual percentage assessment of leaf rust on leaves."
        }
    )

    # Create a Trial
    t1, _ = Trial.objects.get_or_create(
        trial_code="YT-KANO-2026-01",
        defaults={
            "name": "Kano Winter Yield Trial",
            "program": p1,
            "location": l1,
            "season": s1,
            "design_type": "RCBD",
            "num_reps": 3,
            "planting_date": datetime.date(2026, 11, 1),
            "harvest_date": datetime.date(2027, 3, 15),
            "notes": "Standard yield trial testing advanced drought-tolerant spring wheat lines."
        }
    )

    # Generate plots for the trial
    if not Plot.objects.filter(trial=t1).exists():
        print("Generating plots for trial...")
        entries = [g1, g2, g3, g_parents[0]]
        t1.create_plots(entries, seed=42)

    # Add some observations
    plots_qs = Plot.objects.filter(trial=t1)
    if not Observation.objects.filter(plot__in=plots_qs).exists():
        print("Seeding observation data...")
        obs_time = timezone.now()
        
        # Plant height values (numeric)
        ph_values = {
            g1.id: 85.2,
            g2.id: 92.4,
            g3.id: 88.0,
            g_parents[0].id: 80.5
        }
        # Grain yield values (numeric)
        gy_values = {
            g1.id: 4.8,
            g2.id: 4.2,
            g3.id: 5.1,
            g_parents[0].id: 3.5
        }
        
        for plot in plots_qs:
            # Plant height
            val_ph = ph_values.get(plot.germplasm_id, 85.0) + (plot.rep * 1.5 - 3.0)
            Observation.objects.create(
                plot=plot,
                variable=v1,
                value_numeric=round(val_ph, 1),
                observation_time=obs_time,
                notes=f"Measurement in Rep {plot.rep}"
            )
            # Grain yield
            val_gy = gy_values.get(plot.germplasm_id, 4.0) + (plot.rep * 0.2 - 0.4)
            Observation.objects.create(
                plot=plot,
                variable=v2,
                value_numeric=round(val_gy, 2),
                observation_time=obs_time,
                notes=f"Harvest from Rep {plot.rep}"
            )

    print("Database successfully seeded!")

if __name__ == "__main__":
    seed()
