from datetime import datetime
from unittest import TestCase

from schemas.loader import get_kpis_class, get_solutionkpis_class

from opt.kpi import (
    KPI_SPECS,
    KpiTable,
    get_kpi_spec,
    solution_kpis_from_json,
)


KPIsV1 = get_kpis_class('v1')
SolutionKPIsV1 = get_solutionkpis_class('v1')


def make_solution_kpis(
    solution_name: str,
    *,
    num_unassigned: int,
    num_assigned: int,
    cost: int,
    fuel_cost: int,
    time: datetime = datetime(2025, 1, 1),
):
    return SolutionKPIsV1(
        solution_name=solution_name,
        kpis=KPIsV1(
            time=time,
            num_unassigned=num_unassigned,
            num_assigned=num_assigned,
            cost=cost,
            fuel_cost=fuel_cost,
        ),
    )


class TestKpiSpec(TestCase):
    def test_known_fields_have_the_expected_direction(self):
        self.assertFalse(get_kpi_spec("cost").more_is_good)
        self.assertFalse(get_kpi_spec("fuel_cost").more_is_good)
        self.assertFalse(get_kpi_spec("num_unassigned").more_is_good)
        self.assertTrue(get_kpi_spec("num_assigned").more_is_good)
        self.assertIsNone(get_kpi_spec("time").more_is_good)

    def test_unknown_field_falls_back_to_non_directional(self):
        spec = get_kpi_spec("something_new")
        self.assertIsNone(spec.more_is_good)
        self.assertEqual(spec.label, "something_new")

    def test_every_kpis_v1_field_has_a_spec(self):
        for name in KPIsV1.model_fields:
            if name == "version":
                continue  # schema metadata, not a KPI - deliberately excluded
            self.assertIn(name, KPI_SPECS, f"no KpiSpec registered for KPIsV1 field '{name}'")


class TestKpiTable(TestCase):
    def setUp(self):
        # cost/fuel_cost/num_unassigned: lower is better -> solution A wins.
        # num_assigned: higher is better -> solution B wins.
        self.solution_a = make_solution_kpis(
            "A", num_unassigned=2, num_assigned=8, cost=1000, fuel_cost=500,
        )
        self.solution_b = make_solution_kpis(
            "B", num_unassigned=5, num_assigned=10, cost=1500, fuel_cost=500,
        )
        self.table = KpiTable.from_solution_kpis([self.solution_a, self.solution_b])

    def _row(self, name):
        return next(row for row in self.table.rows if row.name == name)

    def test_lower_is_better_kpi_classifies_the_smaller_value_as_good(self):
        row = self._row("cost")
        self.assertEqual(row.classify("A"), "good")
        self.assertEqual(row.classify("B"), "bad")

    def test_higher_is_better_kpi_classifies_the_larger_value_as_good(self):
        row = self._row("num_assigned")
        self.assertEqual(row.classify("A"), "bad")
        self.assertEqual(row.classify("B"), "good")

    def test_tied_values_are_both_good(self):
        row = self._row("fuel_cost")
        self.assertEqual(row.classify("A"), "good")
        self.assertEqual(row.classify("B"), "good")

    def test_non_directional_kpi_is_always_neutral(self):
        row = self._row("time")
        self.assertEqual(row.classify("A"), "neutral")
        self.assertEqual(row.classify("B"), "neutral")

    def test_single_solution_table_has_no_reference_and_is_neutral(self):
        table = KpiTable.from_solution_kpis([self.solution_a])
        row = next(row for row in table.rows if row.name == "cost")
        self.assertIsNone(row.reference_value())
        self.assertEqual(row.classify("A"), "neutral")

    def test_cell_carries_raw_value_and_direction_for_client_side_diffing(self):
        row = self._row("cost")
        cell_a = row.cell("A")
        cell_b = row.cell("B")
        self.assertEqual(cell_a.raw_value, 1000)
        self.assertEqual(cell_a.more_is_good, False)
        self.assertEqual(cell_a.more_is_good_attr, "false")
        self.assertEqual(cell_b.raw_value, 1500)

    def test_non_numeric_cell_has_no_raw_value(self):
        row = self._row("time")
        cell = row.cell("A")
        self.assertIsNone(cell.raw_value)
        self.assertEqual(cell.raw_value_attr, "")
        self.assertEqual(cell.more_is_good_attr, "")

    def test_as_table_rows_shape_and_labels(self):
        rows = self.table.as_table_rows()
        row_by_label = {row[0]: row[1:] for row in rows}
        self.assertIn("Cost", row_by_label)
        cost_cells = row_by_label["Cost"]
        self.assertEqual(cost_cells[0].classification, "good")
        self.assertEqual(cost_cells[1].classification, "bad")
        self.assertEqual(cost_cells[0].text, "1,000")
        self.assertEqual(cost_cells[1].text, "1,500")

    def test_as_table_rows_excludes_the_version_field(self):
        rows = self.table.as_table_rows()
        labels = [row[0] for row in rows]
        self.assertNotIn("version", labels)


class TestSolutionKpisFromJson(TestCase):
    def test_defaults_to_latest_version_when_unspecified(self):
        content = {
            "kpis": {
                "time": "2025-01-01T00:00:00",
                "num_unassigned": 0,
                "num_assigned": 5,
                "cost": 100,
                "fuel_cost": 50,
            }
        }
        solution_kpis = solution_kpis_from_json(content, "solution.json")
        self.assertEqual(solution_kpis.solution_name, "solution.json")
        self.assertEqual(solution_kpis.kpis.cost, 100)

    def test_respects_explicit_version(self):
        content = {
            "version": "v1",
            "kpis": {
                "time": "2025-01-01T00:00:00",
                "num_unassigned": 0,
                "num_assigned": 5,
                "cost": 100,
                "fuel_cost": 50,
            },
        }
        solution_kpis = solution_kpis_from_json(content, "solution.json")
        self.assertIsInstance(solution_kpis, SolutionKPIsV1)
