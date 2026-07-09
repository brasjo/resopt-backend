from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth import get_user_model

from users.models import UserProfile, Organization


User = get_user_model()


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'User Profile'
    extra = 0  # No extra empty forms


class CustomUserAdmin(UserAdmin):
    model = User
    inlines = [
        UserProfileInline,
    ]

    list_display = ('username', 'email', 'full_name', 'is_staff', 'is_active')  # Customize list display

    search_fields = ('username', 'email', 'full_name')  # Customize search fields
    ordering = ('username',)  # Customize ordering of users
    fieldsets = (
        (None, {'fields': ('username', 'email', 'full_name', 'password')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login',)}),  # Only include 'last_login', not 'date_joined'
    )


class OrganizationAdmin(admin.ModelAdmin):
    model = Organization

admin.site.register(User, CustomUserAdmin)
admin.site.register(Organization, OrganizationAdmin)
