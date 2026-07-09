from django.urls import path

from .views_v1 import (
    OptView,
    OptDetailView,
    OptChooseParamSetView,
    OptCloneView,
    OptSolutionListView,
    OptSolutionDetailView,
    OptSolutionCompareView,
    compare_solutions,
    compare_solution_ids,
    delete_opt_logs_view,
    files_view,
    generate_input_file_view,
    individual_validation_view,
    input_builder_view,
    output_file_view,
    relational_validation_view,
    run_summary_view,
    send_to_optimizer_view,
    solution_reports_old_view,
    solution_reports_view,
    upload_file_view,
    deassign_all_flights_view,
    input_file_view,
    user_input_file_view,
    delete_all_solutions_view,
    directories_view,
    directory_file_view,
    directory_solutions_view,
    directory_reports_view,
    run_summary_stream_view,
)

app_name = 'opt'


urlpatterns = [
    path('', OptView.as_view(), name='home'),
    path('<int:run_id>/individual-validation/', individual_validation_view, name='individual-validation'),
    path('<int:run_id>/relational-validation/', relational_validation_view, name='relational-validation'),
    path('<int:run_id>/deassign-all-flights/', deassign_all_flights_view, name='deassign-all-flights'),
    path('<int:run_id>/', OptDetailView.as_view(), name='detail'),
    path('<int:run_id>/choose-param/<int:param_set_id>/', OptChooseParamSetView.as_view(), name='choose-param'),
    path('<int:run_id>/clone/', OptCloneView.as_view(), name='clone'),
    path('<int:run_id>/generate-input-file/', generate_input_file_view, name='generate-input-file'),
    path('<int:run_id>/solutions/', OptSolutionListView.as_view(), name='solution-list'),
    path('<int:run_id>/solutions/compare/', OptSolutionCompareView.as_view(), name='solution-compare'),
    path('<int:run_id>/solutions/<int:output_id>/', OptSolutionDetailView.as_view(), name='solution-detail'),
    path('<int:run_id>/solutions/<int:output_id>/reports/', solution_reports_view, name='solution-reports'),
    path('<int:run_id>/delete-logs/', delete_opt_logs_view, name='delete-logs'),
    path('<int:run_id>/input-builder/', input_builder_view, name='input-builder'),
    path('<int:run_id>/input-file/', input_file_view, name='input-file'),
    path('<int:run_id>/user-input-file/', user_input_file_view, name='user-input-file'),
    path('<int:run_id>/run-summary/', run_summary_view, name='run-summary'),
    path('<int:run_id>/send-to-optimizer/', send_to_optimizer_view, name='send-to-optimizer'),
    path('<int:run_id>/delete-all-solutions/', delete_all_solutions_view, name='delete-all-solutions'),
    path('upload-file/', upload_file_view, name='upload-file'),
    path('compare/', compare_solution_ids, name='compare-solutions-old'),
    path('compare_old/', compare_solutions, name='compare-solutions-old'),
    path('reports_old/', solution_reports_old_view, name='solutions-report-old'),
    path('output-files/<int:output_file_id>/', output_file_view, name='output-file'),
    path('files/<path:path>/', files_view, name='files-view'),  # For listing all files (if needed)
    path('directories/', directories_view, name='directories-view'),  # For listing all run directories
    path('directories/<path:directory>/solutions/', directory_solutions_view, name='directory-solutions-view'),  # For listing all run directories
    path('directories/<path:directory>/<str:filename>', directory_file_view, name='directory-file-view'),  # For listing all run directories
    path('directories/<path:directory>/<str:filename>/reports/', directory_reports_view, name='directory-reports-view'),  # For listing all run directories
    path('opt/directories/<str:run_id>/stream/', run_summary_stream_view, name='run_summary_stream'),
]
