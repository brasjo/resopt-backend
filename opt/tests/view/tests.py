from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.urls import reverse
from django.conf import settings

from params.models import ParameterSet
from users.models import Organization
from opt.models import OptimizationScenario


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
        r = self.client.post(reverse("opt:choose-param", kwargs={"run_id": 1, "param_set_id": 1}))
        print(r.text)
