from pathlib import Path

from django.test import TestCase
from django.urls import reverse

from opt.models import OptimizationScenario
from django.contrib.auth import get_user_model


SCRIPT_DIR = Path(__file__).parent
TEST_DATA_DIR = SCRIPT_DIR / '../test_data'


class VizTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='testuser',
            email='test@email.com',
            password='testpassword'
        )
        self.client.login(username='testuser', password='testpassword')

    def test_upload_flight_list_files(self):
        opt_run = OptimizationScenario.objects.create(user=self.user)
        opt_run.save()
        path = reverse('viz:upload-file')
        path = f"{path}?opt_run_id={opt_run.id}"
        print(path)
        r = self.client.post(path, {
            'file': open(TEST_DATA_DIR / 'flight_list.json', 'rb')
        }, follow=True)
        print(r.status_code, r.content)
        self.assertTrue(opt_run.input_builder, "Input file should be created after upload")
        with open(opt_run.input_builder.path) as f:
            content = f.read()
            self.assertIn('FL123', content, "Uploaded file should contain flight data")
            self.assertIn('JFK', content, "Uploaded file should contain JFK airport code")
            self.assertIn('LAX', content, "Uploaded file should contain LAX airport code")

    def test_upload_aircraft_list_files(self):
        opt_run = OptimizationScenario.objects.create(user=self.user)
        opt_run.save()
        path = reverse('viz:upload-file')
        path = f"{path}?opt_run_id={opt_run.id}"
        print(path)
        r = self.client.post(path, {
            'file': open(TEST_DATA_DIR / 'aircraft_list.json', 'rb')
        }, follow=True)
        print(r.status_code, r.content)
        self.assertTrue(opt_run.input_builder, "Input file should be created after upload")

        with open(opt_run.input_builder.path) as f:
            content = f.read()
            self.assertIn('AAAAA', content, "Uploaded file should contain id/regno AAAAA")
            self.assertIn('777', content, "Uploaded file should contain type 777")
            self.assertIn('2023', content, "Uploaded file should contain year 2023")

    def test_upload_maintenance_list_files(self):
        opt_run = OptimizationScenario.objects.create(user=self.user)
        opt_run.save()
        path = reverse('viz:upload-file')
        path = f"{path}?opt_run_id={opt_run.id}"
        print(path)
        _ = self.client.post(path, {
            'file': open(TEST_DATA_DIR / 'aircraft_list.json', 'rb')
        }, follow=True)
        r = self.client.post(path, {
            'file': open(TEST_DATA_DIR / 'maintenance_list.json', 'rb')
        }, follow=True)
        print(r.status_code, r.content)
        self.assertTrue(opt_run.input_builder, "Input file should be created after upload")
        with open(opt_run.input_builder.path) as f:
            content = f.read()
            self.assertIn('AAAAA', content, "Uploaded file should contain aircraft_id AAAAA")
            self.assertIn('CK-A', content, "Uploaded file should contain type CK-A")
            self.assertIn('2023', content, "Uploaded file should contain year 2023")

    def test_upload_flight_maintenance_aircraft_files(self):
        opt_run = OptimizationScenario.objects.create(user=self.user)
        opt_run.save()
        path = reverse('viz:upload-file')
        path = f"{path}?opt_run_id={opt_run.id}"
        print(path)
        _ = self.client.post(path, {
            'file': open(TEST_DATA_DIR / 'aircraft_list.json', 'rb')
        }, follow=True)
        r = self.client.post(path, {
            'file': open(TEST_DATA_DIR / 'flight_maintenance.json', 'rb')
        }, follow=True)
        print(r.status_code, r.content)
        self.assertTrue(opt_run.input_builder, "Input file should be created after upload")
        with open(opt_run.input_builder.path) as f:
            content = f.read()
            self.assertIn('FL123', content, "Uploaded file should contain flight data")
            self.assertNotIn('BBBBB', content, "Uploaded file should not contain aircraft id BBBBB")
            self.assertIn('AAAAA', content, "Uploaded file should contain maintenance aircraft_id AAAAA")

