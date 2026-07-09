from django.contrib import admin

from .models import ParameterSet


class ParameterSetAdmin(admin.ModelAdmin):
    list_display = ('custom_name', 'created_at',)
    list_filter = ('created_at',)
    search_fields = ('name', 'description', 'user__username')

    def custom_name(self, obj):
        return f"{obj.organization} - {obj.name}"


admin.site.register(ParameterSet, ParameterSetAdmin)
