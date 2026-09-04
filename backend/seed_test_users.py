import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import UserProfile, Program

def create_users():
    User = get_user_model()
    program, _ = Program.objects.get_or_create(
        name="Test Program for Accounts",
        defaults={"crop": "wheat", "description": "For testing"}
    )
    
    roles = ["admin", "breeder", "technician", "viewer"]
    for role in roles:
        u, created = User.objects.get_or_create(username=f"{role}_user")
        u.set_password(f"{role}pass")
        u.save()
        up, _ = UserProfile.objects.get_or_create(user=u, defaults={"role": role, "program": program})
        up.role = role
        up.program = program
        up.save()
        print(f"Created {role}_user with password {role}pass and role {role}")

if __name__ == "__main__":
    create_users()
