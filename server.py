"""
server.py
Prosty serwer HTTP do badania reprodukcji czasu.
Serwuje pliki statyczne + obsługuje POST /api/save-results,
dopisując wyniki do zbiorczego pliku CSV (wyniki_badania.csv).

Uruchomienie:
    python server.py
    → http://localhost:8080
"""

import http.server
import json
import csv
import os
import io
from urllib.parse import urlparse
from format_excel import generate_styled_excel

HOST = '0.0.0.0'
PORT = 8080

# Data directory — configurable via env var for Docker, defaults to current dir
DATA_DIR = os.environ.get('DATA_DIR', '.')
os.makedirs(DATA_DIR, exist_ok=True)

CSV_FILE = os.path.join(DATA_DIR, 'wyniki_badania.csv')
EXCEL_FILE = os.path.join(DATA_DIR, 'wyniki_badania_sformatowane.xlsx')

# Separator — średnik, kompatybilny z polskim Excelem
CSV_DELIMITER = ';'


def build_csv_headers():
    """Returns the ordered list of CSV column headers."""
    headers = ['participantId', 'timestamp', 'age', 'gender', 'education', 'adhdDiagnosis', 'adhdMedication']

    # ASRS individual items
    for q in range(1, 19):
        headers.append(f'asrs_{q}')
    headers.extend(['asrs_partA', 'asrs_partB', 'asrs_total'])

    # Zwlekanie raw + scored
    for q in range(1, 41):
        headers.append(f'zwl_{q}_raw')
    for q in range(1, 41):
        headers.append(f'zwl_{q}_scored')
    headers.append('zwlekanie_total')

    # Experiment trials
    for t in range(1, 9):
        headers.extend([
            f'trial_{t}_targetMs',
            f'trial_{t}_reproducedMs',
            f'trial_{t}_errorMs',
            f'trial_{t}_absErrorMs',
            f'trial_{t}_relErrorPct',
            f'trial_{t}_ratio'
        ])

    return headers


def data_to_row(data, headers):
    """Flattens the nested JSON data into a flat row matching headers."""
    flat = {}

    # Basic info
    flat['participantId'] = data.get('participantId', '')
    flat['timestamp'] = data.get('timestamp', '')

    # Demographic
    demo = data.get('demographic', {})
    flat['age'] = demo.get('age', '')
    flat['gender'] = demo.get('gender', '')
    flat['education'] = demo.get('education', '')
    flat['adhdDiagnosis'] = demo.get('adhdDiagnosis', '')
    flat['adhdMedication'] = demo.get('adhdMedication', '')

    # ASRS
    asrs = data.get('asrs', {})
    answers = asrs.get('answers', {})
    for q in range(1, 19):
        flat[f'asrs_{q}'] = answers.get(f'asrs_{q}', '')
    flat['asrs_partA'] = asrs.get('partA', '')
    flat['asrs_partB'] = asrs.get('partB', '')
    flat['asrs_total'] = asrs.get('total', '')

    # Zwlekanie
    zwl = data.get('zwlekanie', {})
    raw_answers = zwl.get('rawAnswers', {})
    scored_answers = zwl.get('scoredAnswers', {})
    for q in range(1, 41):
        flat[f'zwl_{q}_raw'] = raw_answers.get(f'zwl_{q}', '')
        flat[f'zwl_{q}_scored'] = scored_answers.get(f'zwl_{q}_scored', '')
    flat['zwlekanie_total'] = zwl.get('total', '')

    # Experiment
    trials = data.get('experiment', [])
    for t in range(1, 9):
        trial = trials[t - 1] if t - 1 < len(trials) else {}
        flat[f'trial_{t}_targetMs'] = trial.get('targetMs', '')
        flat[f'trial_{t}_reproducedMs'] = trial.get('reproducedMs', '')
        flat[f'trial_{t}_errorMs'] = trial.get('errorMs', '')
        flat[f'trial_{t}_absErrorMs'] = trial.get('absoluteErrorMs', '')
        flat[f'trial_{t}_relErrorPct'] = trial.get('relativeErrorPct', '')
        flat[f'trial_{t}_ratio'] = trial.get('ratio', '')

    # Build ordered row
    return [str(flat.get(h, '')) for h in headers]


class StudyRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler: serves static files + handles POST /api/save-results."""

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == '/api/save-results':
            self.handle_save_results()
        else:
            self.send_error(404, 'Not Found')

    def handle_save_results(self):
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            headers = build_csv_headers()
            file_exists = os.path.isfile(CSV_FILE)

            # Open in append mode
            with open(CSV_FILE, 'a', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f, delimiter=CSV_DELIMITER)

                # Write header row if file is new
                if not file_exists or os.path.getsize(CSV_FILE) == 0:
                    writer.writerow(headers)

                # Write data row
                row = data_to_row(data, headers)
                writer.writerow(row)

            participant_id = data.get('participantId', 'unknown')
            print(f'[OK] Zapisano wyniki uczestnika: {participant_id}')

            # Automatyczna regeneracja sformatowanego pliku Excel
            if generate_styled_excel(csv_path=CSV_FILE, excel_path=EXCEL_FILE):
                print(f'[OK] Zaktualizowano sformatowany plik Excel: {EXCEL_FILE}')
            else:
                print('[UWAGA] Nie udalo sie wygenerowac sformatowanego pliku Excel.')

            # Respond with success
            response = json.dumps({
                'success': True,
                'message': f'Wyniki uczestnika {participant_id} zapisane pomyslnie.',
                'file': CSV_FILE
            })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))

        except Exception as e:
            print(f'[BLAD] Nie udalo sie zapisac wynikow: {e}')
            response = json.dumps({
                'success': False,
                'message': f'Błąd zapisu: {str(e)}'
            })
            self.send_response(500)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        """Custom log to show only important info."""
        if '/api/' in str(args[0]):
            super().log_message(format, *args)


def main():
    server = http.server.HTTPServer((HOST, PORT), StudyRequestHandler)
    print('==================================================')
    print('  Serwer badania reprodukcji czasu - ADHD')
    print(f'  http://localhost:{PORT}')
    print(f'  Wyniki zapisuja sie do: {CSV_FILE}')
    print('==================================================')
    print('Nacisnij Ctrl+C aby zatrzymac serwer.\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nSerwer zatrzymany.')
        server.server_close()


if __name__ == '__main__':
    main()
