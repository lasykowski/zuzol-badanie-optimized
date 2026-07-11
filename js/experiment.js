/**
 * experiment.js
 * Time reproduction experiment based on Barkley's procedure.
 *
 * Flow per trial:
 *   GET_READY (3s) → STIMULUS (target duration) → WAIT_START → REPRODUCING → TRIAL_COMPLETE (2s)
 *
 * Intervals: 5s, 15s, 30s, 45s — each presented twice = 8 trials.
 * Order: randomized (Fisher-Yates shuffle).
 * Includes 1 practice trial (3s) not counted in results.
 *
 * Uses performance.now() for high-precision timing.
 */

const ExperimentModule = (function () {
    'use strict';

    // Configuration
    var TARGET_INTERVALS = [5000, 15000, 30000, 45000, 5000, 15000, 30000, 45000];
    var PRACTICE_INTERVAL = 3000;
    var GET_READY_DURATION = 3000;
    var TRIAL_COMPLETE_PAUSE = 2000;

    // State
    var state = 'IDLE';
    var trials = [];
    var currentTrialIndex = 0;
    var results = [];
    var startReproductionTime = null;
    var isPractice = false;
    var onCompleteCallback = null;

    // DOM refs
    var stateElements = {};
    var trialCounter = null;

    // Timeouts to clear on cleanup
    var activeTimeouts = [];

    /**
     * Initializes the experiment module.
     * @param {Function} onComplete — called with results array when experiment finishes.
     */
    function init(onComplete) {
        onCompleteCallback = onComplete;

        stateElements = {
            getReady:      document.getElementById('exp-get-ready'),
            stimulus:      document.getElementById('exp-stimulus'),
            waitStart:     document.getElementById('exp-wait-start'),
            reproducing:   document.getElementById('exp-reproducing'),
            trialComplete: document.getElementById('exp-trial-complete')
        };
        trialCounter = document.getElementById('trial-counter');

        // Keyboard handler
        document.addEventListener('keydown', handleKeyDown);
    }

    /**
     * Fisher-Yates shuffle.
     */
    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    /**
     * Starts the experiment (practice trial first, then 8 real trials).
     */
    function start() {
        trials = shuffle(TARGET_INTERVALS);
        results = [];
        currentTrialIndex = -1; // -1 = practice trial
        isPractice = true;

        runTrial(PRACTICE_INTERVAL);
    }

    /**
     * Runs a single trial with the given target interval.
     */
    function runTrial(targetMs) {
        // Update counter
        if (isPractice) {
            trialCounter.textContent = 'Próba ćwiczeniowa';
        } else {
            trialCounter.textContent = 'Próba ' + (currentTrialIndex + 1) + ' z ' + trials.length;
        }

        // Phase 1: GET_READY
        state = 'GET_READY';
        showState('getReady');

        var t1 = setTimeout(function () {
            // Phase 2: STIMULUS
            state = 'STIMULUS';
            showState('stimulus');

            var stimulusStartTime = performance.now();

            var t2 = setTimeout(function () {
                var actualStimulusDuration = performance.now() - stimulusStartTime;

                // Phase 3: WAIT_START
                state = 'WAIT_START';
                showState('waitStart');

                // Store for later use when recording result
                runTrial._currentTarget = targetMs;
                runTrial._actualStimulus = actualStimulusDuration;
            }, targetMs);

            activeTimeouts.push(t2);
        }, GET_READY_DURATION);

        activeTimeouts.push(t1);
    }

    /**
     * Handles keydown events (spacebar).
     */
    function handleKeyDown(e) {
        if (e.code !== 'Space' && e.key !== ' ') return;
        e.preventDefault(); // Prevent page scroll

        if (state === 'WAIT_START') {
            // Start reproduction
            state = 'REPRODUCING';
            startReproductionTime = performance.now();
            showState('reproducing');

        } else if (state === 'REPRODUCING') {
            // End reproduction
            var reproducedDuration = performance.now() - startReproductionTime;
            state = 'TRIAL_COMPLETE';
            showState('trialComplete');

            // Record result (skip practice)
            if (!isPractice) {
                var target = runTrial._currentTarget;
                var error = reproducedDuration - target;

                results.push({
                    trialNumber:       currentTrialIndex + 1,
                    targetMs:          target,
                    actualStimulusMs:  Math.round(runTrial._actualStimulus),
                    reproducedMs:      Math.round(reproducedDuration),
                    errorMs:           Math.round(error),
                    absoluteErrorMs:   Math.round(Math.abs(error)),
                    relativeErrorPct:  parseFloat((error / target * 100).toFixed(2)),
                    ratio:             parseFloat((reproducedDuration / target).toFixed(4))
                });
            }

            // Move to next trial after pause
            var t3 = setTimeout(function () {
                if (isPractice) {
                    // Practice done, start real trials
                    isPractice = false;
                    currentTrialIndex = 0;
                    runTrial(trials[0]);
                } else {
                    currentTrialIndex++;
                    if (currentTrialIndex < trials.length) {
                        runTrial(trials[currentTrialIndex]);
                    } else {
                        // Experiment complete
                        finish();
                    }
                }
            }, TRIAL_COMPLETE_PAUSE);

            activeTimeouts.push(t3);
        }
    }

    /**
     * Shows only the specified state element, hides others.
     */
    function showState(stateName) {
        Object.keys(stateElements).forEach(function (key) {
            stateElements[key].style.display = (key === stateName) ? 'flex' : 'none';
        });

        // Re-trigger animation
        var el = stateElements[stateName];
        el.style.animation = 'none';
        // Force reflow
        void el.offsetHeight;
        el.style.animation = '';
    }

    /**
     * Called when all 8 trials are complete.
     */
    function finish() {
        state = 'FINISHED';
        document.removeEventListener('keydown', handleKeyDown);
        clearAllTimeouts();

        if (typeof onCompleteCallback === 'function') {
            onCompleteCallback(results);
        }
    }

    /**
     * Clears all active timeouts (for cleanup).
     */
    function clearAllTimeouts() {
        activeTimeouts.forEach(function (t) { clearTimeout(t); });
        activeTimeouts = [];
    }

    /**
     * Returns current results (for debugging).
     */
    function getResults() {
        return results;
    }

    return {
        init: init,
        start: start,
        getResults: getResults
    };
})();
