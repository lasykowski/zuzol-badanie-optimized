/**
 * results.js
 * Handles results display and CSV export.
 *
 * CSV structure (one row per participant):
 * participantId, timestamp, age, gender, education, adhdDiagnosis, adhdMedication,
 * asrs_1..asrs_18, asrs_partA, asrs_partB, asrs_total,
 * zwl_1..zwl_40 (raw), zwlekanie_total (scored),
 * trial_1_targetMs..trial_8_targetMs, trial_1_reproducedMs..trial_8_reproducedMs,
 * trial_1_errorMs..trial_8_errorMs, trial_1_relErrorPct..trial_8_relErrorPct,
 * trial_1_ratio..trial_8_ratio
 */

const ResultsModule = (function () {
    'use strict';

    /**
     * Generates a unique participant ID based on timestamp.
     */
    function generateParticipantId() {
        var now = new Date();
        var parts = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ];
        var random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return 'P' + parts.join('') + random;
    }

    /**
     * Displays a summary on the thank-you screen.
     */
    function displaySummary(data) {
        var container = document.getElementById('results-summary');

        var avgError = 0;
        var avgAbsError = 0;
        if (data.experiment && data.experiment.length > 0) {
            var totalError = 0;
            var totalAbsError = 0;
            data.experiment.forEach(function (trial) {
                totalError += trial.errorMs;
                totalAbsError += trial.absoluteErrorMs;
            });
            avgError = Math.round(totalError / data.experiment.length);
            avgAbsError = Math.round(totalAbsError / data.experiment.length);
        }

        container.innerHTML =
            '<h4>Podsumowanie badania</h4>' +
            '<p>Identyfikator uczestnika: <span class="result-value">' + data.participantId + '</span></p>' +
            '<p>ASRS — Wynik łączny: <span class="result-value">' + data.asrs.total + ' / 72</span></p>' +
            '<p>Kwestionariusz Zwlekania — Wynik łączny: <span class="result-value">' + data.zwlekanie.total + ' / 200</span></p>' +
            '<p>Eksperyment — Średni błąd bezwzględny: <span class="result-value">' + avgAbsError + ' ms</span></p>' +
            '<p>Eksperyment — Średni błąd ze znakiem: <span class="result-value">' + avgError + ' ms</span></p>' +
            '<p>Liczba prób: <span class="result-value">' + data.experiment.length + '</span></p>';
    }

    /**
     * Generates a CSV string from all collected data.
     */
    function generateCSV(data) {
        var headers = [];
        var values = [];

        // --- Participant ID & timestamp ---
        headers.push('participantId', 'timestamp');
        values.push(data.participantId, data.timestamp);

        // --- Demographic ---
        headers.push('age', 'gender', 'education', 'adhdDiagnosis', 'adhdMedication');
        values.push(
            data.demographic.age,
            data.demographic.gender,
            data.demographic.education,
            data.demographic.adhdDiagnosis,
            data.demographic.adhdMedication
        );

        // --- ASRS individual answers ---
        for (var q = 1; q <= 18; q++) {
            headers.push('asrs_' + q);
            values.push(data.asrs.answers['asrs_' + q]);
        }
        headers.push('asrs_partA', 'asrs_partB', 'asrs_total');
        values.push(data.asrs.partA, data.asrs.partB, data.asrs.total);

        // --- Zwlekanie raw answers ---
        for (var q2 = 1; q2 <= 40; q2++) {
            headers.push('zwl_' + q2 + '_raw');
            values.push(data.zwlekanie.rawAnswers['zwl_' + q2]);
        }
        // --- Zwlekanie scored answers ---
        for (var q3 = 1; q3 <= 40; q3++) {
            headers.push('zwl_' + q3 + '_scored');
            values.push(data.zwlekanie.scoredAnswers['zwl_' + q3 + '_scored']);
        }
        headers.push('zwlekanie_total');
        values.push(data.zwlekanie.total);

        // --- Experiment trials ---
        for (var t = 0; t < 8; t++) {
            var trial = data.experiment[t] || {};
            var n = t + 1;
            headers.push(
                'trial_' + n + '_targetMs',
                'trial_' + n + '_reproducedMs',
                'trial_' + n + '_errorMs',
                'trial_' + n + '_absErrorMs',
                'trial_' + n + '_relErrorPct',
                'trial_' + n + '_ratio'
            );
            values.push(
                trial.targetMs || '',
                trial.reproducedMs || '',
                trial.errorMs || '',
                trial.absoluteErrorMs || '',
                trial.relativeErrorPct || '',
                trial.ratio || ''
            );
        }

        // Build CSV with proper escaping
        var headerLine = headers.join(';');
        var valueLine = values.map(function (v) {
            var str = String(v);
            // Escape values containing semicolons, quotes, or newlines
            if (str.indexOf(';') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(';');

        return headerLine + '\n' + valueLine + '\n';
    }

    /**
     * Sends data to the server to be appended to the collective CSV file.
     * @param {Object} data — all study data.
     * @returns {Promise<Object>} — server response.
     */
    function saveToServer(data) {
        return fetch('/api/save-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        })
        .then(function (result) {
            console.log('[ResultsModule] Wyniki zapisane na serwerze:', result.message);
            showSaveStatus(true, result.message);
            return result;
        })
        .catch(function (err) {
            console.error('[ResultsModule] Błąd zapisu na serwerze:', err);
            showSaveStatus(false, 'Nie udało się zapisać na serwerze. Pobierz kopię CSV.');
            return { success: false, message: err.message };
        });
    }

    /**
     * Shows save status message on the thank-you screen.
     */
    function showSaveStatus(success, message) {
        var statusEl = document.getElementById('save-status');
        if (!statusEl) return;
        if (success) {
            statusEl.className = 'save-status save-success';
            statusEl.innerHTML = '✅ ' + message;
        } else {
            statusEl.className = 'save-status save-error';
            statusEl.innerHTML = '⚠️ ' + message;
        }
        statusEl.style.display = 'block';
    }

    /**
     * Triggers a CSV file download (backup copy for participant).
     */
    function downloadCSV(data) {
        var csv = generateCSV(data);

        // Add UTF-8 BOM for Excel compatibility
        var bom = '\uFEFF';
        var blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });

        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'wyniki_' + data.participantId + '.csv';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup
        setTimeout(function () {
            URL.revokeObjectURL(link.href);
        }, 1000);
    }

    return {
        generateParticipantId: generateParticipantId,
        displaySummary: displaySummary,
        generateCSV: generateCSV,
        downloadCSV: downloadCSV,
        saveToServer: saveToServer
    };
})();
