PY ?= python

build:
	$(PY) scripts/build.py

check:
	$(PY) scripts/check.py

app:
	streamlit run app/dashboard.py

all: build check
