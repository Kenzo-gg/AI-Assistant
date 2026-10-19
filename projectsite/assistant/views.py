import json, os
import requests
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST
from google import genai
from google.genai import types

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]   # tried in order (replaces MODEL)

SYSTEM_PROMPT = (
    "You are RadBot, a friendly and helpful AI assistant. "
    "If someone asks who or what you are, say you are RadBot. "
    "If they ask which AI model powers you, you can say you run on Google's Gemini. "
    "Keep answers clear and reasonably concise."
)


def index(request):
    return render(request, "assistant/index.html")


@require_POST
def chat(request):
    data = json.loads(request.body)
    prompt = data.get("prompt", "").strip()
    history = data.get("history", [])
    if not prompt:
        return JsonResponse({"error": "Empty prompt"}, status=400)

    contents = []
    for turn in history[-20:]:
        role = "user" if turn.get("role") == "user" else "model"
        text = str(turn.get("text", ""))
        if text:
            contents.append(types.Content(role=role, parts=[types.Part(text=text)]))
    contents.append(types.Content(role="user", parts=[types.Part(text=prompt)]))

    last_error = None
    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            )
            return JsonResponse({"reply": response.text})
        except Exception as e:
            last_error = e
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                continue          # this model's quota is used up, so try the next one
            break                 # any other error: stop trying

    print("GEMINI ERROR:", last_error)
    if "429" in str(last_error) or "RESOURCE_EXHAUSTED" in str(last_error):
        return JsonResponse(
            {"error": "The daily AI limit has been reached. Please try again later."},
            status=429,
        )
    return JsonResponse({"error": "Something went wrong. Try again."}, status=500)


def weather(request):
    city = request.GET.get("city", "Calamba").strip()[:60] or "Calamba"
    try:
        r = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": city, "appid": os.getenv("WEATHER_API_KEY"), "units": "metric"},
            timeout=8,
        )
        if r.status_code == 404:
            return JsonResponse({"error": "City not found."}, status=404)
        r.raise_for_status()
        d = r.json()
        return JsonResponse({
            "city": d["name"],
            "country": d["sys"]["country"],
            "temp": round(d["main"]["temp"]),
            "feels": round(d["main"]["feels_like"]),
            "humidity": d["main"]["humidity"],
            "wind": round(d["wind"]["speed"] * 3.6),   # m/s to km/h
            "desc": d["weather"][0]["description"],
            "icon": d["weather"][0]["icon"],
        })
    except Exception as e:
        print("WEATHER ERROR:", e)
        return JsonResponse({"error": "Couldn't load weather."}, status=500)