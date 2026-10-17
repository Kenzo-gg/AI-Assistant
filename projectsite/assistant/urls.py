from django.urls import path
from django.views.generic import TemplateView
from . import views

urlpatterns = [
    path("", views.index),
    path("api/chat/", views.chat),
    path("sw.js", TemplateView.as_view(
        template_name="sw.js", content_type="application/javascript")),
    path("api/weather/", views.weather),
]