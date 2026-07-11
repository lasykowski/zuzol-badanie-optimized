/**
 * asrs.js
 * ASRS v1.1 — Adult ADHD Self-Report Scale (18 questions).
 * Scoring: each item 0–4 (Nigdy=0, Rzadko=1, Czasami=2, Często=3, Bardzo często=4).
 * Part A: items 1–6, Part B: items 7–18, Total: 0–72.
 */

const ASRSModule = (function () {
    'use strict';

    const SCALE_LABELS = ['Nigdy', 'Rzadko', 'Czasami', 'Często', 'Bardzo często'];

    const QUESTIONS_PART_A = [
        'Jak często masz trudności z dopracowaniem szczegółów jakiegoś zadania, po tym jak już je prawie wykonałeś/aś?',
        'Jak często masz trudności w planowaniu i organizowaniu skomplikowanych zadań?',
        'Jak często zapominasz o spotkaniach lub codziennych obowiązkach?',
        'Jak często unikasz lub odkładasz zadania wymagające długotrwałego wysiłku umysłowego?',
        'Jak często masz nerwowe ruchy rąk lub stóp, gdy musisz siedzieć przez dłuższy czas?',
        'Jak często zdarza ci się być tak pobudzonym/ą, że czujesz, że musisz robić wiele różnych rzeczy, jakbyś „był/a nakręcony/a"?'
    ];

    const QUESTIONS_PART_B = [
        'Jak często popełniasz błędy wynikające z nieuwagi podczas pracy nad nudnym lub trudnym projektem?',
        'Jak często masz problem z utrzymaniem uwagi nad zadaniami, które są nudne lub rutynowe?',
        'Jak często masz problemy z utrzymaniem uwagi na tym, co ludzie mówią, nawet jeśli mówią bezpośrednio do ciebie?',
        'Jak często gubisz, odkładasz rzeczy w niewłaściwe miejsce lub masz trudności ze znalezieniem ich zarówno w pracy, jak i w domu?',
        'Jak często rozpraszają cię różne aktywności lub dźwięki wokół ciebie?',
        'Jak często wstajesz z miejsca w sytuacjach wymagających długiego siedzenia (w pracy, na spotkaniach, wykładach)?',
        'Jak często masz poczucie „wewnętrznego niepokoju"?',
        'Jak często masz trudności, aby rozluźnić się i zrelaksować, kiedy masz czas dla siebie?',
        'Jak często zdarza ci się mówić zbyt dużo (być nadmiernie gadatliwym/ą) w sytuacjach społecznych?',
        'Jak często zdarza ci się, że kiedy rozmawiasz z innymi, łapiesz się na tym, że kończysz za kogoś wypowiedź, zanim on sam zdąży to zrobić?',
        'Jak często podczas rozmowy masz trudność, aby zaczekać na swoją kolej?',
        'Jak często zdarza ci się przeszkadzać lub przerywać innym, kiedy są zajęci?'
    ];

    /**
     * Renders ASRS questions into the DOM.
     */
    function render() {
        var containerA = document.getElementById('asrs-questions-a');
        var containerB = document.getElementById('asrs-questions-b');

        QUESTIONS_PART_A.forEach(function (text, i) {
            containerA.appendChild(createQuestionBlock(i + 1, text));
        });

        QUESTIONS_PART_B.forEach(function (text, i) {
            var qNum = i + 7; // Questions 7–18
            containerB.appendChild(createQuestionBlock(qNum, text));
        });
    }

    /**
     * Creates a question block element.
     */
    function createQuestionBlock(questionNumber, questionText) {
        var block = document.createElement('div');
        block.className = 'question-block';
        block.id = 'asrs-q-' + questionNumber;

        var textDiv = document.createElement('div');
        textDiv.className = 'question-text';

        var numSpan = document.createElement('span');
        numSpan.className = 'question-number';
        numSpan.textContent = questionNumber;

        textDiv.appendChild(numSpan);
        textDiv.appendChild(document.createTextNode(questionText));
        block.appendChild(textDiv);

        var optionsRow = document.createElement('div');
        optionsRow.className = 'options-row';

        SCALE_LABELS.forEach(function (label, value) {
            var chip = document.createElement('div');
            chip.className = 'option-chip';

            var inputId = 'asrs_' + questionNumber + '_' + value;
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'asrs_' + questionNumber;
            input.value = value;
            input.id = inputId;

            var chipLabel = document.createElement('label');
            chipLabel.setAttribute('for', inputId);
            chipLabel.textContent = label;

            chip.appendChild(input);
            chip.appendChild(chipLabel);
            optionsRow.appendChild(chip);

            // Mark question as answered on selection
            input.addEventListener('change', function () {
                block.classList.add('answered');
                // Clear global error
                document.getElementById('asrs-error').textContent = '';
            });
        });

        block.appendChild(optionsRow);
        return block;
    }

    /**
     * Validates that all 18 questions are answered.
     * @returns {Object|null} — scoring data or null if invalid.
     */
    function validate() {
        var answers = {};
        var unanswered = [];

        for (var q = 1; q <= 18; q++) {
            var checked = document.querySelector('input[name="asrs_' + q + '"]:checked');
            if (!checked) {
                unanswered.push(q);
                var block = document.getElementById('asrs-q-' + q);
                if (block) block.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            } else {
                answers['asrs_' + q] = parseInt(checked.value, 10);
                var block2 = document.getElementById('asrs-q-' + q);
                if (block2) block2.style.borderColor = '';
            }
        }

        if (unanswered.length > 0) {
            document.getElementById('asrs-error').textContent =
                'Proszę odpowiedzieć na wszystkie pytania. Brakuje odpowiedzi na pytanie nr: ' +
                unanswered.join(', ') + '.';
            // Scroll to first unanswered
            var firstBlock = document.getElementById('asrs-q-' + unanswered[0]);
            if (firstBlock) firstBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return null;
        }

        // Calculate scores
        var partA = 0;
        var partB = 0;
        for (var q2 = 1; q2 <= 6; q2++) {
            partA += answers['asrs_' + q2];
        }
        for (var q3 = 7; q3 <= 18; q3++) {
            partB += answers['asrs_' + q3];
        }

        return {
            answers: answers,         // Individual answers (asrs_1 through asrs_18)
            partA: partA,             // Sum of items 1–6 (range 0–24)
            partB: partB,             // Sum of items 7–18 (range 0–48)
            total: partA + partB      // Total score (range 0–72)
        };
    }

    return {
        render: render,
        validate: validate
    };
})();
