from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.urls import reverse

from logify.log import log_info, logs_for_instance
from opt.models import OptimizationScenario, OutputFile


class TestOptimizationScenarioDelete(TestCase):
    """Unit tests for the model-level cleanup, independent of the view."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="delete_test_user",
            email="delete_test@example.com",
            password="testpassword",
        )
        self.scenario = OptimizationScenario.objects.create(
            user=self.user,
            name="Scenario to delete",
        )

    def test_delete_removes_own_file_fields_from_storage(self):
        input_builder_name = self.scenario.input_builder.name
        user_input_name = self.scenario.user_input.name
        self.assertTrue(self.scenario.input_builder.storage.exists(input_builder_name))
        self.assertTrue(self.scenario.user_input.storage.exists(user_input_name))

        self.scenario.delete()

        self.assertFalse(
            OptimizationScenario.objects.filter(pk=self.scenario.pk).exists()
        )
        from django.core.files.storage import default_storage
        self.assertFalse(default_storage.exists(input_builder_name))
        self.assertFalse(default_storage.exists(user_input_name))

    def test_delete_removes_the_now_empty_run_directory(self):
        import os
        from django.core.files.storage import default_storage

        run_directory = self.scenario.run_directory
        dir_path = default_storage.path(run_directory)
        self.assertTrue(os.path.isdir(dir_path))

        self.scenario.delete()

        self.assertFalse(os.path.exists(dir_path))

    def test_delete_removes_output_files_from_storage(self):
        output_file = OutputFile.objects.create(
            run=self.scenario,
            file=ContentFile(b"solution data", name="solution.json"),
        )
        file_name = output_file.file.name
        self.assertTrue(output_file.file.storage.exists(file_name))

        self.scenario.delete()

        from django.core.files.storage import default_storage
        self.assertFalse(default_storage.exists(file_name))
        self.assertFalse(OutputFile.objects.filter(pk=output_file.pk).exists())

    def test_delete_removes_log_entries(self):
        log_info(self.scenario, "A log entry for this scenario")
        self.assertEqual(logs_for_instance(self.scenario).count(), 1)

        scenario_pk = self.scenario.pk
        self.scenario.delete()

        # Can't use logs_for_instance after delete (needs a pk), so check
        # via the same content_type/object_id lookup it uses internally.
        from django.contrib.contenttypes.models import ContentType
        from logify.models import LogEntry
        content_type = ContentType.objects.get_for_model(OptimizationScenario)
        remaining = LogEntry.objects.filter(content_type=content_type, object_id=scenario_pk)
        self.assertEqual(remaining.count(), 0)


class TestDeleteScenarioView(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="delete_view_user",
            email="delete_view@example.com",
            password="testpassword",
        )
        self.other_user = get_user_model().objects.create_user(
            username="other_user",
            email="other@example.com",
            password="testpassword",
        )
        self.client.login(username="delete_view_user", password="testpassword")
        self.scenario = OptimizationScenario.objects.create(
            user=self.user,
            name="Scenario to delete via view",
        )

    def test_get_is_rejected(self):
        r = self.client.get(reverse("opt:delete", kwargs={"run_id": self.scenario.id}))
        self.assertEqual(r.status_code, 405)
        self.assertTrue(
            OptimizationScenario.objects.filter(pk=self.scenario.pk).exists()
        )

    def test_post_deletes_scenario_and_redirects_home(self):
        r = self.client.post(
            reverse("opt:delete", kwargs={"run_id": self.scenario.id}),
        )
        self.assertRedirects(r, reverse("opt:home"))
        self.assertFalse(
            OptimizationScenario.objects.filter(pk=self.scenario.pk).exists()
        )

    def test_cannot_delete_another_users_scenario(self):
        other_scenario = OptimizationScenario.objects.create(
            user=self.other_user,
            name="Not yours",
        )
        r = self.client.post(
            reverse("opt:delete", kwargs={"run_id": other_scenario.id}),
        )
        self.assertEqual(r.status_code, 404)
        self.assertTrue(
            OptimizationScenario.objects.filter(pk=other_scenario.pk).exists()
        )

    def test_locked_scenario_can_still_be_deleted(self):
        self.scenario.status = OptimizationScenario.COMPLETED
        self.scenario.save()
        self.assertTrue(self.scenario.is_locked)
        r = self.client.post(
            reverse("opt:delete", kwargs={"run_id": self.scenario.id}),
        )
        self.assertRedirects(r, reverse("opt:home"))
        self.assertFalse(
            OptimizationScenario.objects.filter(pk=self.scenario.pk).exists()
        )


class TestDeleteAllSolutionsRemovesFiles(TestCase):
    """Regression test: delete-all-solutions previously used a bulk
    QuerySet.delete(), which skipped OutputFile's own file cleanup."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="solutions_delete_user",
            email="solutions_delete@example.com",
            password="testpassword",
        )
        self.client.login(username="solutions_delete_user", password="testpassword")
        self.scenario = OptimizationScenario.objects.create(
            user=self.user,
            name="Scenario with solutions",
        )

    def test_files_are_actually_removed_from_storage(self):
        output_file = OutputFile.objects.create(
            run=self.scenario,
            file=ContentFile(b"solution data", name="solution.json"),
        )
        file_name = output_file.file.name
        from django.core.files.storage import default_storage
        self.assertTrue(default_storage.exists(file_name))

        r = self.client.get(
            reverse("opt:delete-all-solutions", args=[self.scenario.id]),
        )
        self.assertRedirects(r, reverse("opt:detail", kwargs={"run_id": self.scenario.id}))
        self.assertFalse(default_storage.exists(file_name))
        self.assertEqual(self.scenario.output_files.count(), 0)
