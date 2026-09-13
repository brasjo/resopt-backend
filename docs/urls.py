from django.urls import path

from .views import user_docs, internal_docs

app_name = 'docs'

urlpatterns = [
    # internal/ routes must come before the <path:filename> catch-all below,
    # or that catch-all would swallow /docs/internal/... requests first.
    path('internal/', internal_docs, name='internal-home'),
    path('internal/<path:filename>', internal_docs, name='internal-file'),
    path('', user_docs, name='home'),
    path('<path:filename>', user_docs, name='file'),
]
