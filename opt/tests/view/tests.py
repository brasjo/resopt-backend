from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.urls import reverse
from django.conf import settings

from params.models import ParameterSet
from users.models import Organization
from opt.models import OptimizationScenario
from opt.permissions import is_scenario_locked


DEFAULT_PARAMETER_SET_CONTENT = settings.DEFAULT_PARAMETER_SET_CONTENT


class ParametersTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='testuser',
            email='test@email.com',
            password='testpassword'
        )
        organization = Organization.objects.get_or_create(
            name="TestInc",
        )[0]
        self.user.profile.organization = organization
        print(self.user.profile.organization)
        self.user.save()
        parameter_set = ParameterSet.objects.get_or_create(
            name='default',
            organization=organization,
        )[0]
        parameter_set.params = ContentFile(DEFAULT_PARAMETER_SET_CONTENT, 'default.json')
        parameter_set.save()
        print('param_set', parameter_set)
        self.client.login(username='testuser', password='testpassword')

    def test_choose_parameters(self):
        opt_scenario = OptimizationScenario.objects.create(
            user=self.user,
            name='Test Scenario 1'
        )
        opt_scenario.save()
        print('opm_sce', opt_scenario)
        r = self.client.post(reverse("opt:choose-param", kwargs={"scenario_id": 1, "param_set_id": 1}))
        print(r.text)


class OptDetailViewPostTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='testuser',
            email='test@email.com',
            password='testpassword'
        )
        self.client.login(username='testuser', password='testpassword')
        self.scenario = OptimizationScenario.objects.create(
            user=self.user,
            name='Test Scenario',
        )

    def base_post_data(self, **overrides):
        data = {
            'opt-name': 'Test Scenario',
            'opt-period_start': '',
            'opt-period_end': '',
            'params-use_min_turn_time_rule': 'on',
            'params-default_min_turn_time': '01:00',
            'params-use_max_turn_time_rule': 'on',
            'params-max_turn_time': '02:00',
            'params-max_turn_time_penalty_per_minute': '0',
            'params-use_pax_penalty': 'on',
            'params-use_fuel_penalty': 'on',
            'params-fuel_penalty_per_kg': '0',
            'params-pax_penalty_per_seat_difference': '0',
            'params-allow_refleeting_with_penalty': 'on',
            'params-penalty_per_refleet': '0',
            'min_turn_time-TOTAL_FORMS': '0',
            'min_turn_time-INITIAL_FORMS': '0',
            'rules-TOTAL_FORMS': '0',
            'rules-INITIAL_FORMS': '0',
        }
        data.update(overrides)
        return data

    def test_get_renders_detail_page(self):
        r = self.client.get(reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}))
        self.assertEqual(r.status_code, 200)

    def test_post_with_no_changes_succeeds(self):
        # A successful save redirects (Post/Redirect/Get, so a later
        # browser refresh does a plain GET instead of re-submitting the
        # form) - follow=True lets us still inspect the final rendered
        # page's context after that redirect.
        r = self.client.post(
            reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}),
            self.base_post_data(),
            follow=True,
        )
        self.assertEqual(r.redirect_chain, [
            (reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}), 302),
        ])
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.context['opt_form'].errors)
        self.assertFalse(r.context['params_form'].errors)
        self.assertFalse(r.context['min_turn_time_formset'].errors)
        self.assertFalse(r.context['rule_formset'].errors)

    def test_post_renaming_scenario_saves_name(self):
        r = self.client.post(
            reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}),
            self.base_post_data(**{'opt-name': 'Renamed Scenario'}),
        )
        self.assertRedirects(r, reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}))
        self.scenario.refresh_from_db()
        self.assertEqual(self.scenario.name, 'Renamed Scenario')

    def test_post_adds_custom_min_turn_time(self):
        data = self.base_post_data(**{
            'min_turn_time-TOTAL_FORMS': '1',
            'min_turn_time-INITIAL_FORMS': '0',
            'min_turn_time-0-key': 'min_turn_time_A320',
            'min_turn_time-0-value': '00:45',
        })
        r = self.client.post(
            reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}),
            data,
            follow=True,
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.context['min_turn_time_formset'].errors)
        builder = self.scenario.load_builder()
        custom_min_turn_times = builder.parameters.custom_min_turn_times
        self.assertEqual(len(custom_min_turn_times), 1)
        self.assertEqual(custom_min_turn_times[0].param, 'min_turn_time_A320')

    def test_post_invalid_opt_form_shows_errors_without_crashing(self):
        r = self.client.post(
            reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}),
            self.base_post_data(**{'opt-name': ''}),
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.context['opt_form'].errors)
        self.scenario.refresh_from_db()
        self.assertEqual(self.scenario.name, 'Test Scenario')

    def test_post_locked_scenario_is_rejected(self):
        self.scenario.locked = True
        self.scenario.save()
        self.assertTrue(is_scenario_locked(self.user, self.scenario))
        r = self.client.post(
            reverse('opt:detail', kwargs={'scenario_id': self.scenario.id}),
            self.base_post_data(**{'opt-name': 'Should not apply'}),
            follow=True,
        )
        self.assertEqual(r.status_code, 200)
        self.scenario.refresh_from_db()
        self.assertEqual(self.scenario.name, 'Test Scenario')
