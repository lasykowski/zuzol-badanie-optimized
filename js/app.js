/**
 * app.js
 * Main application controller.
 * Manages navigation between sections, collects data from all modules,
 * and orchestrates the full study flow.
 *
 * Flow: Welcome → Demographic → ASRS → Zwlekanie → Experiment Intro → Experiment → Thank You
 */

(function () {
    'use strict';

    // Section IDs in order
    var SECTIONS = [
        'welcome',           // 0
        'demographic',       // 1
        'asrs',              // 2
        'zwlekanie',         // 3
        'experiment-intro',  // 4
        'experiment',        // 5
        'thank-you'          // 6
    ];

    // Progress stages (maps to visible progress bar steps)
    var PROGRESS_MAP = {
        'welcome':          { step: 1, total: 5, pct: 0 },
        'demographic':      { step: 1, total: 5, pct: 10 },
        'asrs':             { step: 2, total: 5, pct: 30 },
        'zwlekanie':        { step: 3, total: 5, pct: 50 },
        'experiment-intro': { step: 4, total: 5, pct: 70 },
        'experiment':       { step: 4, total: 5, pct: 80 },
        'thank-you':        { step: 5, total: 5, pct: 100 }
    };

    // Collected data
    var studyData = {
        participantId: '',
        timestamp: '',
        demographic: null,
        asrs: null,
        zwlekanie: null,
        experiment: null
    };

    var currentSectionIndex = 0;
    var CHECKPOINT_KEY = 'time-reproduction-study-checkpoint-v1';
    var CHECKPOINT_VERSION = 1;

    /**
     * Navigates to a section by ID.
     */
    function goToSection(sectionId, onShown) {
        // Hide current section with transition
        var currentSection = document.querySelector('.section.active');
        if (currentSection) {
            currentSection.classList.add('transitioning-out');
            setTimeout(function () {
                currentSection.classList.remove('active', 'transitioning-out');

                // Show new section
                showSection(sectionId);
                if (typeof onShown === 'function') onShown();
            }, 280);
        } else {
            showSection(sectionId);
            if (typeof onShown === 'function') onShown();
        }
    }

    function showSection(sectionId) {
        var section = document.getElementById(sectionId);
        if (!section) return;

        section.classList.add('active');

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'auto' });

        // Update progress bar
        var progress = PROGRESS_MAP[sectionId];
        if (progress) {
            var progressBar = document.getElementById('progress-bar');
            var progressContainer = document.getElementById('progress-bar-container');
            progressBar.style.width = progress.pct + '%';
            document.getElementById('progress-text').textContent =
                'Etap ' + progress.step + ' z ' + progress.total;
            progressContainer.setAttribute('aria-valuenow', String(progress.pct));
            progressContainer.setAttribute(
                'aria-valuetext',
                'Etap ' + progress.step + ' z ' + progress.total
            );
        }

        // Manage body class for experiment fullscreen
        if (sectionId === 'experiment') {
            document.body.classList.add('experiment-active');
        } else {
            document.body.classList.remove('experiment-active');
        }

        currentSectionIndex = SECTIONS.indexOf(sectionId);

        // Re-trigger card animations
        var card = section.querySelector('.card');
        if (card) {
            card.classList.remove('fade-in');
            void card.offsetHeight;
            card.classList.add('fade-in');
        }
    }

    function saveCheckpoint(safeSection) {
        try {
            sessionStorage.setItem(CHECKPOINT_KEY, JSON.stringify({
                version: CHECKPOINT_VERSION,
                safeSection: safeSection,
                studyData: studyData
            }));
        } catch (error) {
            console.warn('[App] Nie udało się zapisać checkpointu:', error);
        }
    }

    function clearCheckpoint() {
        try {
            sessionStorage.removeItem(CHECKPOINT_KEY);
        } catch (error) {
            console.warn('[App] Nie udało się usunąć checkpointu:', error);
        }
    }

    function isCompleteDemographic(data) {
        return data && Number.isInteger(data.age) && data.age >= 18 && data.age <= 99 &&
            typeof data.gender === 'string' && data.gender !== '' &&
            typeof data.education === 'string' && data.education !== '' &&
            typeof data.adhdDiagnosis === 'string' && data.adhdDiagnosis !== '' &&
            typeof data.adhdMedication === 'string' && data.adhdMedication !== '';
    }

    function hasNumberedAnswers(answers, prefix, count, suffix) {
        if (!answers || typeof answers !== 'object') return false;
        suffix = suffix || '';
        for (var i = 1; i <= count; i++) {
            if (typeof answers[prefix + i + suffix] !== 'number') return false;
        }
        return true;
    }

    function isCompleteAsrs(data) {
        return data && hasNumberedAnswers(data.answers, 'asrs_', 18) &&
            typeof data.partA === 'number' &&
            typeof data.partB === 'number' &&
            typeof data.total === 'number';
    }

    function isCompleteZwlekanie(data) {
        return data &&
            hasNumberedAnswers(data.rawAnswers, 'zwl_', 40) &&
            hasNumberedAnswers(data.scoredAnswers, 'zwl_', 40, '_scored') &&
            typeof data.total === 'number';
    }

    function isCompleteExperiment(data) {
        return Array.isArray(data) && data.length === 8 && data.every(function (trial, index) {
            return trial && trial.trialNumber === index + 1 &&
                trial.order === index + 1 &&
                typeof trial.targetMs === 'number' &&
                typeof trial.actualStimulusMs === 'number' &&
                typeof trial.reproducedMs === 'number' &&
                typeof trial.tabHiddenDuringTrial === 'boolean';
        });
    }

    function getRecoverySection(checkpoint) {
        if (!checkpoint || checkpoint.version !== CHECKPOINT_VERSION ||
            !checkpoint.studyData ||
            typeof checkpoint.studyData.participantId !== 'string' ||
            !checkpoint.studyData.participantId ||
            typeof checkpoint.studyData.timestamp !== 'string' ||
            !checkpoint.studyData.timestamp) {
            return null;
        }

        var data = checkpoint.studyData;
        var safeSection = checkpoint.safeSection;
        if (safeSection === 'demographic') return 'demographic';
        if (!isCompleteDemographic(data.demographic)) return null;
        if (safeSection === 'asrs') return 'asrs';
        if (!isCompleteAsrs(data.asrs)) return null;
        if (safeSection === 'zwlekanie') return 'zwlekanie';
        if (!isCompleteZwlekanie(data.zwlekanie)) return null;
        if (safeSection === 'experiment-intro') return 'experiment-intro';
        if (safeSection === 'thank-you' && isCompleteExperiment(data.experiment)) {
            return 'thank-you';
        }
        return null;
    }

    function recoverCheckpoint() {
        var serialized;
        try {
            serialized = sessionStorage.getItem(CHECKPOINT_KEY);
            if (!serialized) return null;
            var checkpoint = JSON.parse(serialized);
            var recoverySection = getRecoverySection(checkpoint);
            if (!recoverySection) {
                clearCheckpoint();
                return null;
            }
            studyData = checkpoint.studyData;
            return recoverySection;
        } catch (error) {
            clearCheckpoint();
            return null;
        }
    }

    function showRecoveredSection(sectionId) {
        document.querySelectorAll('.section.active').forEach(function (section) {
            section.classList.remove('active', 'transitioning-out');
        });
        showSection(sectionId);
    }

    function saveCompletedStudy() {
        return ResultsModule.saveToServer(studyData).then(function (result) {
            if (result && result.success !== false) {
                clearCheckpoint();
            }
            return result;
        });
    }

    /**
     * Initializes all modules and event listeners.
     */
    function init() {
        var recoverySection = recoverCheckpoint();
        if (!recoverySection) {
            studyData.participantId = ResultsModule.generateParticipantId();
            studyData.timestamp = new Date().toISOString();
        }

        // --- Render questionnaires ---
        ASRSModule.render();
        ZwlekanieModule.render();

        // --- Initialize experiment ---
        ExperimentModule.init(function (experimentResults) {
            studyData.experiment = experimentResults;
            saveCheckpoint('thank-you');

            // Move to thank-you screen
            goToSection('thank-you');

            // Display summary
            ResultsModule.displaySummary(studyData);

            // Automatically save to collective CSV on the server
            saveCompletedStudy();
        });

        // --- Initialize demographic form ---
        DemographicModule.init(function (demographicData) {
            studyData.demographic = demographicData;
            saveCheckpoint('asrs');
            goToSection('asrs');
        });

        // --- Welcome: Start button ---
        document.getElementById('btn-start').addEventListener('click', function () {
            saveCheckpoint('demographic');
            goToSection('demographic');
        });

        // --- ASRS: Next button ---
        document.getElementById('btn-asrs-next').addEventListener('click', function () {
            var asrsData = ASRSModule.validate();
            if (asrsData) {
                studyData.asrs = asrsData;
                saveCheckpoint('zwlekanie');
                goToSection('zwlekanie');
            }
        });

        // --- Zwlekanie: Next button ---
        document.getElementById('btn-zwlekanie-next').addEventListener('click', function () {
            var zwlekanieData = ZwlekanieModule.validate();
            if (zwlekanieData) {
                studyData.zwlekanie = zwlekanieData;
                saveCheckpoint('experiment-intro');
                goToSection('experiment-intro');
            }
        });

        // --- Experiment Intro: Start button ---
        document.getElementById('btn-start-experiment').addEventListener('click', function () {
            var startButton = this;
            if (startButton.disabled) return;
            startButton.disabled = true;
            goToSection('experiment', function () {
                ExperimentModule.start();
            });
        });

        // --- Download CSV button ---
        document.getElementById('btn-download-csv').addEventListener('click', function () {
            ResultsModule.downloadCSV(studyData);
        });

        if (recoverySection) {
            showRecoveredSection(recoverySection);
            if (recoverySection === 'thank-you') {
                ResultsModule.displaySummary(studyData);
                saveCompletedStudy();
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
