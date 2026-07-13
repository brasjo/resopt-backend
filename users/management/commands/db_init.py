from pathlib import Path
from typing import TYPE_CHECKING
from datetime import datetime, timedelta
from shutil import copyfile
import json
import os

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.conf import settings
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile

from users.models import Organization
from opt.models import OptimizationScenario, generate_run_directory
from resopt_utils.utils import list_leaf_directories


if TYPE_CHECKING:
    from users.models import CustomUser

User = get_user_model()
OUTPUT_DIR = settings.OUTPUT_DIR
SCENARIOS_DIR = settings.SCENARIOS_DIR



class Command(BaseCommand):
    help = 'Create db and admin and guest users for testing'

    def handle(self, *args, **kwargs):
        call_command('migrate', interactive=False)
        self.stdout.write(self.style.SUCCESS('Database migrations applied successfully.'))
        org_dict = {
            'name': 'ResOptInc',
        }
        org_admin = Organization.objects.filter(name=org_dict['name']).first()
        if not org_admin:
            org_admin = Organization.objects.create(**org_dict)
            self.stdout.write(self.style.SUCCESS(f"Organization {org_admin.name} created successfully."))
        else:
            self.stdout.write(self.style.WARNING(f"Organization {org_admin.name} already exists. Skipping creation."))
        adminuser = self.create_adminuser(org_admin)
        org_dict = {
            'name': 'GuestOrg',
        }
        org_guest = Organization.objects.filter(name=org_dict['name']).first()
        if not org_guest:
            org_guest = Organization.objects.create(**org_dict)
            self.stdout.write(self.style.SUCCESS(f"Organization {org_guest.name} created successfully."))
        else:
            self.stdout.write(self.style.WARNING(f"Organization {org_guest.name} already exists. Skipping creation."))
        _guestuser = self.create_guestuser(org_guest)
        self.load_from_output_dir(adminuser)
        self.stdout.write(
            self.style.SUCCESS(
                'Database initialization completed successfully.'
            )
        )

    def load_output_files(
        self, opt_scenario: OptimizationScenario,
        output_dir: str | Path
    ) -> None:
        output_file_paths = find_output_files(output_dir)
        for output_file_path in output_file_paths:
            assert output_file_path.exists(), \
                f"File should exist at {output_file_path}"
            with open(output_file_path) as f:
                output_data = f.read()
            opt_scenario.output_files.create(
                file=ContentFile(
                    content=output_data.encode(),
                    name=output_file_path.name,
                )
            )
            self.stdout.write(
                self.style.SUCCESS(f"Output file saved for scenario: {opt_scenario.name}")
            )

    def load_run_summary_file(
        self, opt_scenario: OptimizationScenario,
        output_dir: str | Path
    ) -> None:
        summary_file_path = Path(output_dir) / "meta.json"
        if not summary_file_path.exists():
            self.stdout.write(
                self.style.WARNING(f"No meta.json found for scenario: {opt_scenario.name}. Trying with run_summary.json")
            )
            summary_file_path = Path(output_dir) / "run_summary.json"
            assert summary_file_path.exists(), \
                f"File should exist at {summary_file_path}"
        with open(summary_file_path) as f:
            summary_data = f.read()
        opt_scenario.replace_run_summary(json.loads(summary_data))
        self.stdout.write(
            self.style.SUCCESS(f"Summary file saved for scenario: {opt_scenario.name}")
        )

    def copy_resource_file(
        self,
        opt_scenario: OptimizationScenario,
        output_dir: str | Path,
    ) -> None:
        resource_file_path = Path(output_dir) / "resources.json"
        if not resource_file_path.exists():
            return
        new_resource_path = Path(settings.MEDIA_ROOT) / opt_scenario.run_directory / "resources.json"
        if not resource_file_path.exists():
            # Uploaded to S3
            return
        copyfile(resource_file_path, new_resource_path)
        self.stdout.write(
            self.style.SUCCESS(f"Resource file copied to: {new_resource_path}")
        )

    def copy_maintenances_file(
        self,
        opt_scenario: OptimizationScenario,
        output_dir: str | Path,
    ) -> None:
        maintenances_file_path = Path(output_dir) / "maintenances.json"
        if not maintenances_file_path.exists():
            # It's okay if this file doesn't exist
            return
        new_maintenances_path = Path(settings.MEDIA_ROOT) / opt_scenario.run_directory / "maintenances.json"
        copyfile(maintenances_file_path, new_maintenances_path)
        self.stdout.write(
            self.style.SUCCESS(f"Maintenances copied to: {new_maintenances_path}")
        )

    def copy_meta_file(
        self,
        opt_scenario: OptimizationScenario,
        output_dir: str | Path,
    ) -> None:
        meta_file_path = Path(output_dir) / "meta.json"
        if not meta_file_path.exists():
            self.stdout.write(
                self.style.WARNING(f"No meta.json found for scenario: {opt_scenario.name}. Trying with run_summary.json")
            )
            meta_file_path = Path(output_dir) / "run_summary.json"
            assert meta_file_path.exists(), \
                f"File should exist at {meta_file_path}"
        new_meta_path = Path(settings.MEDIA_ROOT) / opt_scenario.run_directory / "meta.json"
        copyfile(meta_file_path, new_meta_path)
        self.stdout.write(
            self.style.SUCCESS(f"Meta copied to: {new_meta_path}")
        )

    def create_input_builder_file(
        self,
        opt_scenario: OptimizationScenario,
        output_dir: str | Path,
    ) -> None:
        resources_file_path = Path(output_dir) / "resources.json"
        if not resources_file_path.exists():
            input_file = Path(output_dir) / "input.json"
            assert input_file.exists(), \
                f"File should exist at {input_file}"
            return
        resources = json.load(open(resources_file_path))
        new_resources = []
        if "new_format" in output_dir:
            new_resources = resources
        else:
            for _id, resource in resources.items():
                res = {
                    'id': resource['regno'],
                    'regno': resource['regno'],
                    'type': resource['ac_type'],
                    'service_start': resource['service_start'],
                    'service_end': resource.get('service_end'),
                    'last_known_station': resource.get('last_known_station'),
                    'available_from': resource.get('available_from'),
                    'fuel_consumption': resource.get('fuel_consumption'),
                    'min_turn_time': resource.get('min_turn_time'),
                    'num_of_seats': resource.get('num_of_seats'),
                    'seating_conf': resource.get('seating_conf'),
                }
                new_resources.append(res)
        ac_ids = set(r['id'] for r in new_resources)
        activity_file_path = Path(output_dir) / "activities.json"
        assert activity_file_path.exists(), \
            f"File should exist at {activity_file_path}"
        activities = json.load(open(activity_file_path))
        new_activities = []
        if "new_format" in output_dir:
            new_activities = activities
        else:
            for _id, activity in activities.items():
                act = {
                    'start': activity['sobt'],
                    'end': activity['sibt'],
                    'planned_actype': activity['planned_actype'],
                    'adep': activity['adep'],
                    'ades': activity['ades'],
                    'aircraft_id': activity.get('assignedRegno') if activity.get('assignedRegno') in ac_ids else None,
                    'fl_num': activity['fl_num'],
                }
                new_activities.append(act)
        maintenances_file_path = Path(output_dir) / "maintenances.json"
        new_maintenances = []
        if maintenances_file_path.exists():
            maintenances = json.load(open(maintenances_file_path))
            if "new_format" in output_dir:
                new_maintenances = maintenances
            else:
                for _id, maintenance in maintenances.items():
                    try:
                        maint = {
                            'aircraft_id': maintenance.get('ac_id', maintenance['ac']),
                            'start': maintenance['sobt'],
                        'end': maintenance['sibt'],
                        'station': maintenance['station'],
                        'type': maintenance['type'],
                        }
                    except KeyError as e:
                        self.stdout.write(
                            self.style.ERROR(
                                f"Error loading maintenance {_id} for scenario {opt_scenario.name}: {e}\n{maintenance}"
                            )
                        )
                        continue
                    new_maintenances.append(maint)
        builder_dict = {
            'flights': new_activities,
            'aircrafts': new_resources,
            'maintenances': new_maintenances,
        }
        # self.stdout.write(f'Updating input builder with:\n{json.dumps(builder_dict, indent=2)}')
        opt_scenario.update_input(json.dumps(builder_dict, indent=4))
        self.stdout.write(
            self.style.SUCCESS(f"Input builder file updated for scenario: {opt_scenario.name}")
        )

    def copy_activities_file(
        self,
        opt_scenario: OptimizationScenario,
        output_dir: str | Path,
    ) -> None:
        activity_file_path = Path(output_dir) / "activities.json"
        if not activity_file_path.exists():
            return

        new_activity_path = Path(settings.MEDIA_ROOT) / opt_scenario.run_directory / "activities.json"
        if not activity_file_path.exists():
            # Uploaded to S3
            return
        copyfile(activity_file_path, new_activity_path)
        self.stdout.write(
            self.style.SUCCESS(f"Activity copied to: {new_activity_path}")
        )

    def load_from_output_dir(self, user: 'CustomUser'):
        paths = [SCENARIOS_DIR]
        now = datetime.now()
        for p in paths:
            opt_scenarios = OptimizationScenario.objects.all()
            for opt_dir in list_leaf_directories(p):
                self.stdout.write(f"Found output directory: {opt_dir}")
                parents = None
                if '/output/' in opt_dir:
                    parents = opt_dir.split('/output/')[1]
                elif '/scenarios/' in opt_dir:
                    parents = opt_dir.split('/scenarios/')[1]
                opt_scenario = opt_scenarios.filter(
                    name=parents
                )
                assert parents
                if opt_scenario.exists():
                    self.stdout.write(
                        "Optimization scenario already exist for directory: "
                        f"{opt_dir}. Skipping..."
                    )
                    continue
                opt_scenario = OptimizationScenario.objects.create(
                    name=parents,
                    user=user,
                    run_directory=generate_run_directory(user.username, now),
                    status=OptimizationScenario.COMPLETED,
                )
                self.load_output_files(opt_scenario, opt_dir)
                self.load_run_summary_file(opt_scenario, opt_dir)
                self.copy_activities_file(opt_scenario, opt_dir)
                self.copy_resource_file(opt_scenario, opt_dir)
                self.copy_maintenances_file(opt_scenario, opt_dir)
                self.copy_meta_file(opt_scenario, opt_dir)
                self.create_input_builder_file(opt_scenario, opt_dir)
                now += timedelta(seconds=1)

    def create_adminuser(self, org) -> 'CustomUser':
        user_data = {
                'username': 'adminuser',
                'email': 'adminuser@example.com',
                'password': 'password123',
                'full_name': 'Shared Admin',
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
        }
        user = User.objects.filter(username=user_data['username']).first()
        if user:
            self.stdout.write(self.style.WARNING(f"User {user_data['username']} already exists. Skipping..."))
            return user
        user = User.objects.create_user(**user_data)
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully created user: {user.username}"
            )
        )
        user.profile.organization = org
        user.profile.save()
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully attached org: {org.name} to user: {user.username}"
            )
        )
        return user

    def create_guestuser(self, org) -> 'CustomUser':
        user_data = {
            'username': 'guestuser',
            'email': 'guestuser@example.com',
            'password': 'password123',
            'full_name': 'Shared Guest',
            'is_staff': False,
            'is_superuser': False,
            'is_active': True,
        }
        user = User.objects.filter(username=user_data['username']).first()
        if user:
            self.stdout.write(
                self.style.WARNING(
                    f"User {user_data['username']} already exists. Skipping..."
                )
            )
            return user
        user = User.objects.create_user(**user_data)
        user.profile.organization = org
        user.profile.save()
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully created user: {user.username}"
            )
        )
        return user


def find_output_files(directory: str | Path) -> list[Path]:
    directory = Path(directory)
    return [
        directory / f for f in os.listdir(directory)
        if f.startswith("step") and f.endswith(".json")
    ]