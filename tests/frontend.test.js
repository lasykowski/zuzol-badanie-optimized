const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function loadResultsModule(fetchImplementation) {
    const context = {
        Blob,
        console,
        document: { getElementById: () => null },
        fetch: fetchImplementation || (() => Promise.reject(new Error('unused'))),
        Promise,
        setTimeout: (callback) => {
            callback();
            return 1;
        },
        Uint8Array,
        URL,
        window: { crypto: webcrypto }
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'results.js'), 'utf8');
    vm.runInContext(source + '\nthis.moduleUnderTest = ResultsModule;', context);
    return context.moduleUnderTest;
}

function sampleData() {
    const answers = {};
    const rawAnswers = {};
    const scoredAnswers = {};
    for (let item = 1; item <= 18; item += 1) answers[`asrs_${item}`] = 0;
    for (let item = 1; item <= 40; item += 1) {
        rawAnswers[`zwl_${item}`] = 3;
        scoredAnswers[`zwl_${item}_scored`] = 3;
    }
    const experiment = Array.from({ length: 8 }, (_, index) => ({
        trialNumber: index + 1,
        order: index + 1,
        targetMs: 5000,
        actualStimulusMs: index === 0 ? 0 : 5000,
        reproducedMs: 5000,
        errorMs: 0,
        absoluteErrorMs: 0,
        relativeErrorPct: 0,
        ratio: 1,
        tabHiddenDuringTrial: false
    }));
    return {
        participantId: '00000000-0000-4000-8000-000000000000',
        timestamp: '2026-09-09T20:00:00.000Z',
        demographic: {
            age: 30,
            gender: 'kobieta',
            education: 'wyzsze_magister',
            adhdDiagnosis: 'nie',
            adhdMedication: 'nie'
        },
        asrs: { answers, partA: 0, partB: 0, total: 0 },
        zwlekanie: { rawAnswers, scoredAnswers, total: 120 },
        experiment
    };
}

test('participant ID is a UUID', () => {
    const id = loadResultsModule().generateParticipantId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('CSV preserves zero, false, order and stimulus duration', () => {
    const lines = loadResultsModule().generateCSV(sampleData()).trim().split('\n');
    const headers = lines[0].split(';');
    const values = lines[1].split(';');
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    assert.equal(row.trial_1_order, '1');
    assert.equal(row.trial_1_actualStimulusMs, '0');
    assert.equal(row.trial_1_errorMs, '0');
    assert.equal(row.trial_1_tabHiddenDuringTrial, 'false');
});

test('server save retries twice and then succeeds', async () => {
    let attempts = 0;
    const module = loadResultsModule(() => {
        attempts += 1;
        if (attempts < 3) return Promise.reject(new Error('network'));
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, message: 'ok' })
        });
    });
    const result = await module.saveToServer(sampleData());
    assert.equal(result.success, true);
    assert.equal(attempts, 3);
});
