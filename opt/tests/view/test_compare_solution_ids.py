import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase


def make_kpis_json(cost: int) -> dict:
    return {
        "version": "v1",
        "kpis": {
            "time": "2025-01-01T00:00:00",
            "num_unassigned": 0,
            "num_assigned": 5,
            "cost": cost,
            "fuel_cost": 10,
        },
        "assignments": [],
    }


class CompareSolutionIdsTestCase(TestCase):
    """solution_ids identifies each solution as "run_directory/filename",
    URL-encoded per id (encodeURIComponent on the frontend, e.g.
    protected_files/gantt-playback.js's encodeFilePath). This used to be
    encoded by substituting '/' with '-' and decoded by guessing which '-'
    was really a '/' - broken for any run_directory containing a literal
    hyphen, which optimizer-generated run directories always do (they're
    timestamped, e.g. "tmp-output-2026-05-29-13h45m28s").
    """

    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username='superuser',
            email='super@example.com',
            password='testpassword',
        )
        self.client.login(username='superuser', password='testpassword')
        self.tmp_optimizer_repo = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp_optimizer_repo.cleanup)
        optimizer_repo_dir = Path(self.tmp_optimizer_repo.name) / 'resopt-optimizer'
        self.run_dir = optimizer_repo_dir / 'tmp' / 'output' / 'tmp-output-2026-05-29-13h45m28s'
        self.run_dir.mkdir(parents=True)
        (self.run_dir / 'step0_sol0.json').write_text(json.dumps(make_kpis_json(1000)))
        (self.run_dir / 'step180_sol0.json').write_text(json.dumps(make_kpis_json(800)))
        self.optimizer_repo_dir = optimizer_repo_dir

    def _get(self, solution_ids: str):
        with patch('opt.views_v1.OPTIMIZER_REPO_DIR', self.optimizer_repo_dir):
            return self.client.get('/opt/compare/', {'solution_ids': solution_ids})

    def test_resolves_a_run_directory_containing_literal_hyphens(self):
        solution_ids = (
            "resopt-optimizer/tmp/output/tmp-output-2026-05-29-13h45m28s/step0_sol0.json,"
            "resopt-optimizer/tmp/output/tmp-output-2026-05-29-13h45m28s/step180_sol0.json"
        )
        response = self._get(solution_ids)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "step0_sol0.json")
        self.assertContains(response, "step180_sol0.json")

    def test_missing_file_is_reported_as_not_found_not_a_500(self):
        solution_ids = (
            "resopt-optimizer/tmp/output/tmp-output-2026-05-29-13h45m28s/step0_sol0.json,"
            "resopt-optimizer/tmp/output/tmp-output-2026-05-29-13h45m28s/does_not_exist.json"
        )
        response = self._get(solution_ids)
        self.assertEqual(response.status_code, 404)

    def test_identifier_without_a_slash_is_rejected_cleanly(self):
        response = self._get("not-a-valid-identifier")
        self.assertEqual(response.status_code, 400)
