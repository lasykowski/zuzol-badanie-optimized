"""
format_excel.py
Pomocniczy skrypt do konwersji surowego pliku CSV na ładnie sformatowany arkusz Excel (.xlsx) w pionie.
Uczestnicy są reprezentowani jako kolumny (Uczestnik 1, Uczestnik 2 itd.),
a zmienne/pytania są wierszami.
"""

import os
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

CSV_FILE = 'wyniki_badania.csv'
EXCEL_FILE = 'wyniki_badania_sformatowane.xlsx'
CSV_DELIMITER = ';'


def generate_styled_excel(csv_path=CSV_FILE, excel_path=EXCEL_FILE):
    """Konwertuje CSV na transponowany i sformatowany plik Excel (.xlsx) w pionie."""
    if not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0:
        return False

    try:
        # 1. Wczytanie danych z CSV (z obsługą BOM i separatorem średnika)
        df = pd.read_csv(csv_path, sep=CSV_DELIMITER, encoding='utf-8-sig')

        # Transpozycja tabeli: zmienne stają się indeksami wierszy
        df_transposed = df.transpose()
        
        # Nazywamy nagłówki kolumn: Uczestnik 1, Uczestnik 2, ...
        column_names = []
        for i in range(len(df)):
            participant_id = df.iloc[i].get('participantId', f'Uczestnik_{i+1}')
            column_names.append(str(participant_id))
            
        df_transposed.columns = column_names
        df_transposed = df_transposed.reset_index()
        df_transposed.rename(columns={'index': 'Zmienna'}, inplace=True)

        # Zapis do Excela (wersja surowa)
        df_transposed.to_excel(excel_path, index=False)

        # 2. Otwarcie za pomocą openpyxl do ostylowania
        wb = load_workbook(excel_path)
        ws = wb.active
        ws.title = "Wyniki Badania"

        # Kolory wypełnień dla sekcji (zastosowane do kolumny ze zmiennymi)
        fill_id = PatternFill(start_color="EAEAEA", end_color="EAEAEA", fill_type="solid")  # Szary dla ID/Timestamp
        fill_demo = PatternFill(start_color="E6F2FF", end_color="E6F2FF", fill_type="solid")  # Jasnoniebieski dla Demografii
        fill_asrs = PatternFill(start_color="E6F9E6", end_color="E6F9E6", fill_type="solid")  # Jasnozielony dla ASRS
        fill_zwl = PatternFill(start_color="F2E6FF", end_color="F2E6FF", fill_type="solid")   # Jasnofioletowy dla Zwlekania
        fill_exp = PatternFill(start_color="FFE6D9", end_color="FFE6D9", fill_type="solid")   # Jasnopomarańczowy dla Eksperymentu

        # Tła dla naprzemiennych kolumn uczestników (pionowa zebra)
        fill_col_even = PatternFill(start_color="FAFAFA", end_color="FAFAFA", fill_type="solid")
        fill_col_odd = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

        # Style tekstu
        font_header_row = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
        font_header_col = Font(name="Segoe UI", size=10, bold=True, color="000000")
        font_data = Font(name="Segoe UI", size=10, color="000000")

        # Fioletowy gradient/wypełnienie dla pierwszego wiersza (Nagłówek kolumn)
        purple_header_fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")

        # Cienkie obramowanie
        thin_border = Border(
            left=Side(style='thin', color='E0E0E0'),
            right=Side(style='thin', color='E0E0E0'),
            top=Side(style='thin', color='E0E0E0'),
            bottom=Side(style='thin', color='E0E0E0')
        )

        header_border = Border(
            left=Side(style='thin', color='B0B0B0'),
            right=Side(style='thin', color='B0B0B0'),
            top=Side(style='medium', color='5D2EC0'),
            bottom=Side(style='medium', color='5D2EC0')
        )

        # 3. Formatowanie pierwszego wiersza (nagłówki kolumn z ID uczestników)
        ws.row_dimensions[1].height = 28
        for col_idx in range(1, ws.max_column + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = purple_header_fill
            cell.font = font_header_row
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = header_border

        # 4. Formatowanie danych w wierszach
        for row_idx in range(2, ws.max_row + 1):
            ws.row_dimensions[row_idx].height = 20
            var_cell = ws.cell(row=row_idx, column=1)
            var_name = str(var_cell.value)

            # Wybór koloru sekcji dla komórki zmiennej (Kolumna A)
            if var_name in ['participantId', 'timestamp']:
                var_cell.fill = fill_id
            elif var_name in ['age', 'gender', 'education', 'adhdDiagnosis', 'adhdMedication']:
                var_cell.fill = fill_demo
            elif var_name.startswith('asrs_'):
                var_cell.fill = fill_asrs
            elif var_name.startswith('zwl_') or var_name == 'zwlekanie_total':
                var_cell.fill = fill_zwl
            elif var_name.startswith('trial_'):
                var_cell.fill = fill_exp

            var_cell.font = font_header_col
            var_cell.alignment = Alignment(horizontal="left", vertical="center")
            var_cell.border = thin_border

            # Formatowanie kolumn uczestników (pionowa zebra)
            for col_idx in range(2, ws.max_column + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = font_data
                cell.fill = fill_col_even if col_idx % 2 == 0 else fill_col_odd
                cell.border = thin_border

                # Konwersja typów danych i wyrównanie wartości
                val_str = str(cell.value or '')
                
                # Rzutowanie na int lub float
                if var_name in ['age'] or var_name.startswith('asrs_') or var_name.startswith('zwl_') or var_name == 'zwlekanie_total':
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                    try:
                        cell.value = int(cell.value)
                    except (ValueError, TypeError):
                        pass
                elif var_name.startswith('trial_'):
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                    try:
                        if '.' in val_str:
                            cell.value = float(cell.value)
                        else:
                            cell.value = int(cell.value)
                    except (ValueError, TypeError):
                        pass
                else:
                    cell.alignment = Alignment(horizontal="center", vertical="center")

        # 5. Zamrożenie pierwszego wiersza i pierwszej kolumny
        ws.freeze_panes = 'B2'

        # 6. Automatyczne dostosowanie szerokości kolumn
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or '')
                max_len = max(max_len, len(val))
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        # Zapisz gotowy arkusz
        wb.save(excel_path)
        return True
    except Exception as e:
        print(f"[BLAD Excel] Nie udalo sie sformatowac Excela: {e}")
        return False


if __name__ == '__main__':
    if generate_styled_excel():
        print(f"[OK] Pionowy arkusz Excel wygenerowany i sformatowany: {EXCEL_FILE}")
    else:
        print("[INFO] Brak pliku CSV lub plik jest pusty.")
