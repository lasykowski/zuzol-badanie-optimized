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

    /**
     * Navigates to a section by ID.
     */
    function goToSection(sectionId) {
        // Hide current section with transition
        var currentSection = document.querySelector('.section.active');
        if (currentSection) {
            currentSection.classList.add('transitioning-out');
            setTimeout(function () {
                currentSection.classList.remove('active', 'transitioning-out');

                // Show new section
                showSection(sectionId);
            }, 280);
        } else {
            showSection(sectionId);
        }
    }

    function showSection(sectionId) {
        var section = document.getElementById(sectionId);
        if (!section) return;

        section.classList.add('active');

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Update progress bar
        var progress = PROGRESS_MAP[sectionId];
        if (progress) {
            document.getElementById('progress-bar').style.width = progress.pct + '%';
            document.getElementById('progress-text').textContent =
                'Etap ' + progress.step + ' z ' + progress.total;
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

    /**
     * Initializes all modules and event listeners.
     */
    function init() {
        // Generate participant ID
        studyData.participantId = ResultsModule.generateParticipantId();
        studyData.timestamp = new Date().toISOString();

        // --- Render questionnaires ---
        ASRSModule.render();
        ZwlekanieModule.render();

        // --- Initialize experiment ---
        ExperimentModule.init(function (experimentResults) {
            studyData.experiment = experimentResults;

            // Move to thank-you screen
            goToSection('thank-you');

            // Display summary
            ResultsModule.displaySummary(studyData);

            // Automatically save to collective CSV on the server
            ResultsModule.saveToServer(studyData);
        });

        // --- Initialize demographic form ---
        DemographicModule.init(function (demographicData) {
            studyData.demographic = demographicData;
            goToSection('asrs');
        });

        // --- Welcome: Start button ---
        document.getElementById('btn-start').addEventListener('click', function () {
            goToSection('demographic');
        });

        // --- ASRS: Next button ---
        document.getElementById('btn-asrs-next').addEventListener('click', function () {
            var asrsData = ASRSModule.validate();
            if (asrsData) {
                studyData.asrs = asrsData;
                goToSection('zwlekanie');
            }
        });

        // --- Zwlekanie: Next button ---
        document.getElementById('btn-zwlekanie-next').addEventListener('click', function () {
            var zwlekanieData = ZwlekanieModule.validate();
            if (zwlekanieData) {
                studyData.zwlekanie = zwlekanieData;
                goToSection('experiment-intro');
            }
        });

        // --- Experiment Intro: Start button ---
        document.getElementById('btn-start-experiment').addEventListener('click', function () {
            goToSection('experiment');
            // Small delay to ensure section is visible before starting
            setTimeout(function () {
                ExperimentModule.start();
            }, 500);
        });

        // --- Download CSV button ---
        document.getElementById('btn-download-csv').addEventListener('click', function () {
            ResultsModule.downloadCSV(studyData);
        });

        // --- Prevent spacebar from scrolling page ---
        document.addEventListener('keydown', function (e) {
            if (e.code === 'Space' || e.key === ' ') {
                var activeSection = SECTIONS[currentSectionIndex];
                if (activeSection === 'experiment') {
                    e.preventDefault();
                }
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
