# Badanie reprodukcji czasu — wdrożenie produkcyjne

Aplikacja zbiera wyniki badania do SQLite i udostępnia eksport CSV oraz Excel.
Frontend zachowuje dotychczasowy wygląd i przebieg badania.

## Ważna informacja o danych

Endpointy `/api/download/csv` i `/api/download/excel` są publiczne zgodnie z
przyjętą konfiguracją. Eksport zawiera między innymi wiek, informację o
diagnozie ADHD i przyjmowanych lekach. Każda osoba znająca adres domeny może
pobrać te dane. Przed uruchomieniem badania należy zweryfikować zgodność takiego
udostępnienia z wymogami uczelni, zgodą uczestników i RODO.

## Uruchomienie lokalne

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn server:app --host 127.0.0.1 --port 8080
```

W PowerShell aktywacja środowiska to `.venv\Scripts\Activate.ps1`. Aplikacja
będzie dostępna pod `http://127.0.0.1:8080`, a baza w `data/`.

## Portainer na Oracle Cloud

### 1. DNS i firewall

1. Utwórz rekord `A` domeny wskazujący na publiczny adres IP instancji Oracle.
2. W Oracle Network Security List/NSG otwórz TCP 80 i 443 do Nginx Proxy
   Managera. Nie otwieraj publicznie portu 67 aplikacji.
3. Sprawdź prywatny adres IP instancji Oracle (zwykle `10.x.x.x`). NPM będzie
   łączył się z tym adresem na porcie 67.

### 2. Stack w Portainerze

Zmiany muszą znajdować się w repozytorium dostępnym dla Portainera. W
Portainerze wybierz **Stacks → Add stack → Repository**, wskaż repozytorium i
plik `docker-compose.yml`.

Dodaj zmienne środowiskowe:

```dotenv
APP_IMAGE=zuzol-badanie:local
APP_PORT=67
MAX_BODY_BYTES=65536
APP_MEMORY_LIMIT=512m
APP_CPU_LIMIT=1.0
```

Wdróż stack. Kontener powinien przejść w stan `healthy`. Aplikacja celowo ma
jednego workera i jedną replikę; nie skaluj jej horyzontalnie przy lokalnym
SQLite.

### 3. Proxy Host w Nginx Proxy Manager

W **Hosts → Proxy Hosts → Add Proxy Host** ustaw:

- Domain Names: właściwa domena, np. `badanie.example.pl`
- Scheme: `http`
- Forward Hostname/IP: prywatny adres IP instancji Oracle, np. `10.0.0.123`
- Forward Port: `67`
- Websockets Support: wyłączone
- Block Common Exploits: włączone

W zakładce SSL wybierz nowy certyfikat Let's Encrypt oraz włącz **Force SSL** i
**HTTP/2 Support**. W polu Advanced można dodać:

```nginx
client_max_body_size 64k;
proxy_connect_timeout 10s;
proxy_read_timeout 120s;
proxy_send_timeout 120s;
```

Po wdrożeniu sprawdź:

```text
https://www.zuza.rel.pl/health
https://www.zuza.rel.pl/api/download/csv
https://www.zuza.rel.pl/api/download/excel
```

### 4. Ograniczenie liczby zapisów w NPM

W wolumenie `/data` kontenera NPM utwórz plik
`nginx/custom/http_top.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=study_save:10m rate=10r/m;
```

Zrestartuj NPM. Następnie w Proxy Host dodaj **Custom Location** dla
`/api/save-results`, kierowaną do prywatnego adresu IP instancji Oracle na
porcie `67`, a w jej konfiguracji Advanced wpisz:

```nginx
limit_req zone=study_save burst=3 nodelay;
client_max_body_size 64k;
```

Pozostałe ścieżki pozostają bez tego limitu. Zapis jednego uczestnika wykonuje
się tylko raz po ukończeniu badania.

## Dane, eksport i kopie zapasowe

Trwała baza znajduje się w wolumenie `zuzol-data` jako
`/app/data/wyniki_badania.sqlite3`. Stary `wyniki_badania.csv`, jeśli istnieje
w wolumenie przy pierwszym starcie, zostanie jednorazowo dołączony do eksportów.

Spójną kopię działającej bazy utworzysz poleceniem:

```bash
docker exec zuzol-badanie python /app/scripts/backup_sqlite.py
```

Skopiuj powstały plik poza serwer, np. `docker cp`, snapshotem wolumenu albo do
Oracle Object Storage. Kopia w tym samym wolumenie nie chroni przed awarią
instancji. Przykładowy drugi krok po zainstalowaniu OCI CLI:

```bash
oci os object bulk-upload --bucket-name NAZWA_BUCKETU --src-dir /katalog/kopii
```

Uruchamiaj backup z crona co najmniej raz dziennie i okresowo sprawdzaj
odtworzenie kopii poleceniem `PRAGMA integrity_check`.

## Aktualizacja i diagnostyka

- Nie używaj automatycznej aktualizacji Watchtower podczas aktywnego badania.
- Przed aktualizacją utwórz backup, przebuduj stack i sprawdź `/health`.
- Logi są rotowane do trzech plików po 10 MB.
- Kod aplikacji i katalog danych nie są publiczne: `/server.py` i `/data/`
  zwracają 404.

## Testy

```bash
pip install -r requirements-dev.txt
pytest -q
```

Testy obejmują walidację danych, limit żądania, deduplikację, równoległe zapisy,
whitelistę plików statycznych, migrację starego CSV oraz eksport CSV/Excel.
