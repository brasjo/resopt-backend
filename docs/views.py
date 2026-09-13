import mimetypes
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404

from resopt_utils.utils import is_within_base

DOCS_ROOT = settings.PROTECTED_FILES_ROOT / "docs"


def _serve_doc_file(root: Path, filename: str):
    """
    Serve a file from a generated doc site rooted at `root`. Defaults an
    empty/directory path to index.html, like a static-site server would.
    """
    file_path = (root / (filename or "index.html")).resolve()
    if not is_within_base(file_path, root):
        raise Http404("Not found.")
    if file_path.is_dir():
        file_path = file_path / "index.html"
    if not file_path.exists() or not file_path.is_file():
        raise Http404("Not found.")
    content_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(open(file_path, "rb"), content_type=content_type)


@login_required
def user_docs(request, filename=""):
    return _serve_doc_file(DOCS_ROOT / "user", filename)


@login_required
def internal_docs(request, filename=""):
    if not request.user.is_superuser:
        raise Http404("Not found.")
    return _serve_doc_file(DOCS_ROOT / "internal", filename)
