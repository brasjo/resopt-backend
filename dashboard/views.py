from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.shortcuts import render
from django.utils import timezone

from opt.models import OptimizationRun, OptimizationScenario
from params.models import ParameterSet

User = get_user_model()

# Fixed, reserved colors: green = healthy/complete, red = error, orange = timeout.
# The remaining in-progress states get distinct categorical hues.
STATUS_COLORS = {
    OptimizationScenario.COMPLETED: '#10B981',
    OptimizationScenario.ERROR: '#e74c3c',
    OptimizationScenario.TIMEOUT: '#f39c12',
    OptimizationScenario.PROCESSING: '#3498db',
    OptimizationScenario.IN_QUEUE: '#8b5cf6',
    OptimizationScenario.SENT: '#06b6d4',
    OptimizationScenario.PENDING: '#6b7280',
}
OTHER_STATUS_COLOR = '#6b7280'
MAX_STATUS_SLICES = 6
RUN_TREND_DAYS = 30


def _minutes_trend(scenario_queryset, month_start, today):
    # OptimizationRun only stores started_at/ended_at (no stored duration),
    # and Sum() over a DurationField subtraction expression isn't reliably
    # supported on SQLite, so duration is computed in Python instead.
    runs = (
        OptimizationRun.objects
        .filter(
            scenario__in=scenario_queryset,
            started_at__date__gte=month_start,
            started_at__date__lte=today,
            ended_at__isnull=False,
        )
        .values_list('started_at', 'ended_at')
    )
    totals_by_day = defaultdict(float)
    for started_at, ended_at in runs:
        day = timezone.localtime(started_at).date() if timezone.is_aware(started_at) else started_at.date()
        totals_by_day[day] += (ended_at - started_at).total_seconds()

    labels, data = [], []
    for offset in range((today - month_start).days + 1):
        day = month_start + timedelta(days=offset)
        labels.append(str(day.day))
        data.append(round(totals_by_day.get(day, 0) / 60, 1))
    return {'labels': labels, 'data': data}, round(sum(data), 1)


def _status_breakdown(queryset):
    status_labels = dict(OptimizationScenario.STATUS_CHOICES)
    rows = queryset.values('status').annotate(count=Count('id'))
    breakdown = sorted(
        (
            {
                'status': row['status'],
                'label': status_labels.get(row['status'], row['status']),
                'count': row['count'],
                'color': STATUS_COLORS.get(row['status'], OTHER_STATUS_COLOR),
            }
            for row in rows if row['count'] > 0
        ),
        key=lambda row: row['count'],
        reverse=True,
    )
    if len(breakdown) > MAX_STATUS_SLICES:
        head, tail = breakdown[:MAX_STATUS_SLICES], breakdown[MAX_STATUS_SLICES:]
        breakdown = head + [{
            'status': 'other',
            'label': 'Other',
            'count': sum(row['count'] for row in tail),
            'color': OTHER_STATUS_COLOR,
        }]
    return breakdown


def _run_trend(queryset, since, num_days):
    counts_by_day = {
        row['day']: row['count']
        for row in (
            queryset
            .filter(created_at__date__gte=since)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
        )
    }
    labels, data = [], []
    for offset in range(num_days):
        day = since + timedelta(days=offset)
        labels.append(day.strftime('%b ') + str(day.day))
        data.append(counts_by_day.get(day, 0))
    return {'labels': labels, 'data': data}, sum(data)


def _switchable_users(user):
    """
    Superusers can browse any user's dashboard; organization admins
    (UserProfile.is_admin) can browse dashboards within their own
    organization only. Everyone else gets None (no switcher shown).
    """
    if user.is_superuser:
        return User.objects.order_by('username')
    profile = getattr(user, 'profile', None)
    if profile and profile.is_admin and profile.organization:
        return User.objects.filter(
            profile__organization=profile.organization,
        ).order_by('username')
    return None


@login_required
def home(request):
    user = request.user

    switchable_users = _switchable_users(user)
    viewing_user = user
    if switchable_users is not None:
        as_user_id = request.GET.get('as_user')
        if as_user_id:
            viewing_user = switchable_users.filter(pk=as_user_id).first() or user

    today = timezone.now().date()
    month_start = today.replace(day=1)

    scenarios_this_month = OptimizationScenario.objects.filter(
        user=viewing_user, created_at__date__gte=month_start,
    ).count()

    organization = getattr(getattr(viewing_user, 'profile', None), 'organization', None)
    parameter_set_count = (
        ParameterSet.objects.filter(organization=organization).count()
        if organization else 0
    )

    user_scenarios = OptimizationScenario.objects.filter(user=viewing_user)
    if organization:
        org_user_ids = User.objects.filter(
            profile__organization=organization,
        ).values_list('id', flat=True)
        org_scenarios = OptimizationScenario.objects.filter(user_id__in=org_user_ids)
    else:
        org_scenarios = OptimizationScenario.objects.none()

    since = today - timedelta(days=RUN_TREND_DAYS - 1)
    user_run_trend_chart, user_run_trend_total = _run_trend(user_scenarios, since, RUN_TREND_DAYS)
    org_run_trend_chart, org_run_trend_total = _run_trend(org_scenarios, since, RUN_TREND_DAYS)

    minutes_chart, minutes_total = _minutes_trend(user_scenarios, month_start, today)

    context = {
        'viewing_user': viewing_user,
        'is_self': viewing_user == user,
        'switchable_users': switchable_users,
        'organization': organization,
        'scenarios_this_month': scenarios_this_month,
        'parameter_set_count': parameter_set_count,
        'minutes_total': minutes_total,
        'minutes_chart': minutes_chart,
        'user_status_breakdown': _status_breakdown(user_scenarios),
        'org_status_breakdown': _status_breakdown(org_scenarios),
        'user_run_trend_chart': user_run_trend_chart,
        'user_run_trend_total': user_run_trend_total,
        'org_run_trend_chart': org_run_trend_chart,
        'org_run_trend_total': org_run_trend_total,
    }
    return render(request, 'dashboard/dashboard.html', context)
