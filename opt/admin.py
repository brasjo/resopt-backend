from django.contrib import admin
from django.contrib.contenttypes.admin import GenericTabularInline

from logify.models import LogEntry
from opt.models import (
    OptimizationScenario,
    OutputFile,
)


class OutputFileInline(admin.TabularInline):
    model = OutputFile
    extra = 0  # Don't show extra blank forms
    readonly_fields = ('file', 'uploaded_at')  # Optional: make fields read-only
    fields = ('file', 'uploaded_at')  # Optional: limit displayed fields
    can_delete = False  # Optional: prevent deletion in inline
    show_change_link = True  # Optional: show a link to the full OutputFile admin


class LogEntryInline(GenericTabularInline):
    model = LogEntry
    extra = 0
    readonly_fields = ('timestamp', 'level', 'msg', 'source', 'extra')
    fields = ('timestamp', 'level', 'msg', 'source', 'extra')
    can_delete = False
    show_change_link = True


class OptimizationScenarioAdmin(admin.ModelAdmin):
    readonly_fields = ('run_directory',)
    list_display = (
        'id',
        'user',
        'name',
        'created_at',
        'input_builder',
        'user_input',
        'status',
        'run_summary_file',
    )
    search_fields = ('name', 'user__username')
    list_filter = ('status',)
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'
    list_per_page = 20
    list_select_related = ('user',)

    inlines = [OutputFileInline, LogEntryInline]


class OutputFileAdmin(admin.ModelAdmin):
    list_display = ('run', 'file')
    readonly_fields = ('id', 'uploaded_at')
    search_fields = ('run__name', 'file')
    list_filter = ('uploaded_at',)
    ordering = ('-uploaded_at',)
    date_hierarchy = 'uploaded_at'
    list_per_page = 20
    list_select_related = ('run',)


admin.site.register(OptimizationScenario, OptimizationScenarioAdmin)
admin.site.register(OutputFile, OutputFileAdmin)
