/**
 * zwlekanie.js
 * Kwestionariusz Zwlekania — 40 items, scale 1–5.
 *
 * Reversed items (positive/non-procrastinating statements):
 * 1, 11, 13, 14, 16, 21, 23, 25, 27, 28, 29, 30, 32, 33, 36, 37, 38, 39
 * Reversal formula: reversed = 6 - raw (so 1→5, 2→4, 3→3, 4→2, 5→1).
 *
 * Higher total score = higher procrastination tendency.
 */

const ZwlekanieModule = (function () {
    'use strict';

    // Items with reversed scoring (positive statements)
    var REVERSED_ITEMS = [1, 11, 13, 14, 16, 21, 23, 25, 27, 28, 29, 30, 32, 33, 36, 37, 38, 39];

    var QUESTIONS = [
        'Wykorzystuję „okienka" w zajęciach, by wykonać zadania przewidziane na wieczór.',
        'W chorobliwy sposób marnotrawię czas.',
        'Nie realizuję zadań na czas.',
        'Potrafię znaleźć wymówkę, by czegoś nie zrobić.',
        'Gdy obowiązują mnie terminy, czekam z pracą do ostatniej chwili.',
        'Przystąpienie do realizacji zadania często zabiera mi wiele czasu.',
        'Często odwlekam przez wiele dni nawet proste prace, których wykonanie nie zajmuje wiele czasu.',
        'Za pracę zabieram się dopiero w ostatniej chwili.',
        'Gdy zbliża się termin egzaminu, często przyłapuję się na realizacji innych zadań.',
        'W opinii moich przyjaciół i rodziny lubię zwlekać do ostatniej chwili.',
        'Zazwyczaj realizuję wszystkie zadania, które wyznaczyłem/am sobie danego dnia.',
        'Gdy jestem gdzieś umówiony/a, moi znajomi oczekują, że się nieco spóźnię.',
        'Poświęcam wymagany czas nawet na nudne zadania, takie jak nauka.',
        'Zazwyczaj rozpoczynam realizację zadań natychmiast po ich otrzymaniu.',
        'Niepotrzebnie przeciągam realizację zadań, nawet wówczas, gdy są ważne.',
        'Natychmiast przystępuję do realizacji niezbędnych prac.',
        'Odczuwam wstyd z powodu odwlekania pracy, lecz nie skłania mnie to do działania.',
        'Marnotrawię czas, ale nie potrafię na to nic poradzić.',
        'Często odwlekam rozpoczęcie niezbędnych prac.',
        'Tak długo odwlekam rozpoczęcie pracy, że często nie jestem w stanie jej skończyć w terminie.',
        'Gdy muszę zrealizować ważny projekt, zabieram się za niego tak szybko, jak to możliwe.',
        'Nie jestem w stanie przemóc się, by rozpocząć pracę nawet wówczas, gdy zdaję sobie sprawę z wagi zadania.',
        'Postępuję zgodnie z ustalonymi przez siebie planami.',
        'Gdy zbliża się termin realizacji zadania, często tracę czas na inne sprawy.',
        'Na zebraniach zazwyczaj pojawiam się przed ich rozpoczęciem.',
        'Często spóźniam się na spotkania i zebrania.',
        'Wychodzę wcześniej, aby nie spóźniać się na spotkania.',
        'Ważne zadania kończę przed terminem.',
        'Często kończę pracę wcześniej, niż jest to wymagane.',
        'Przekładanie spraw na jutro — to nie w moim stylu.',
        'Gdy staję w obliczu trudnego problemu, zastanawiam się, jak go odsunąć w czasie.',
        'Nie odwlekam pracy, gdy wiem, że musi ona zostać wykonana.',
        'Punktualnie stawiam się na większość spotkań.',
        'Często zdarza mi się wykonywać zadania na gwałt, gdy grozi przekroczenie terminu.',
        'Często łapię się na wykonywaniu czynności, które zamierzałem/am wykonać wiele dni wcześniej.',
        'Zazwyczaj wykonuję wszystkie oczekujące zadania przed udaniem się na wieczorny relaks.',
        'Zazwyczaj punktualnie przychodzę na zajęcia.',
        'Jestem punktualniejszy/a niż większość znanych mi osób.',
        'Terminowo wywiązuję się ze zobowiązań dzięki systematycznej pracy.',
        'Obiecuję sobie, że coś zrobię, lecz następnie opóźniam rozpoczęcie pracy.'
    ];

    /**
     * Renders the 40 questions into the DOM.
     */
    function render() {
        var container = document.getElementById('zwlekanie-questions');

        QUESTIONS.forEach(function (text, i) {
            var qNum = i + 1;
            container.appendChild(createQuestionBlock(qNum, text));
        });
    }

    /**
     * Creates a question block with a 1–5 numeric scale.
     */
    function createQuestionBlock(questionNumber, questionText) {
        var block = document.createElement('div');
        block.className = 'question-block';
        block.id = 'zwl-q-' + questionNumber;

        var textDiv = document.createElement('div');
        textDiv.className = 'question-text';

        var numSpan = document.createElement('span');
        numSpan.className = 'question-number';
        numSpan.textContent = questionNumber;

        textDiv.appendChild(numSpan);
        textDiv.appendChild(document.createTextNode(questionText));
        block.appendChild(textDiv);

        var scaleRow = document.createElement('div');
        scaleRow.className = 'scale-row';

        for (var v = 1; v <= 5; v++) {
            var option = document.createElement('div');
            option.className = 'scale-option';

            var inputId = 'zwl_' + questionNumber + '_' + v;
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'zwl_' + questionNumber;
            input.value = v;
            input.id = inputId;

            var label = document.createElement('label');
            label.setAttribute('for', inputId);
            label.textContent = v;

            option.appendChild(input);
            option.appendChild(label);
            scaleRow.appendChild(option);

            input.addEventListener('change', function () {
                block.classList.add('answered');
                document.getElementById('zwlekanie-error').textContent = '';
            });
        }

        block.appendChild(scaleRow);
        return block;
    }

    /**
     * Validates all 40 questions and calculates the total score.
     * @returns {Object|null}
     */
    function validate() {
        var rawAnswers = {};
        var unanswered = [];

        for (var q = 1; q <= 40; q++) {
            var checked = document.querySelector('input[name="zwl_' + q + '"]:checked');
            if (!checked) {
                unanswered.push(q);
                var block = document.getElementById('zwl-q-' + q);
                if (block) block.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            } else {
                rawAnswers['zwl_' + q] = parseInt(checked.value, 10);
                var block2 = document.getElementById('zwl-q-' + q);
                if (block2) block2.style.borderColor = '';
            }
        }

        if (unanswered.length > 0) {
            document.getElementById('zwlekanie-error').textContent =
                'Proszę odpowiedzieć na wszystkie stwierdzenia. Brakuje odpowiedzi na nr: ' +
                unanswered.join(', ') + '.';
            var firstBlock = document.getElementById('zwl-q-' + unanswered[0]);
            if (firstBlock) firstBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return null;
        }

        // Calculate scored values (with reversals)
        var scoredAnswers = {};
        var total = 0;

        for (var q2 = 1; q2 <= 40; q2++) {
            var raw = rawAnswers['zwl_' + q2];
            var scored;
            if (REVERSED_ITEMS.indexOf(q2) !== -1) {
                scored = 6 - raw; // Reverse: 1→5, 2→4, 3→3, 4→2, 5→1
            } else {
                scored = raw;
            }
            scoredAnswers['zwl_' + q2 + '_scored'] = scored;
            total += scored;
        }

        return {
            rawAnswers: rawAnswers,       // Raw answers (zwl_1 through zwl_40), values 1–5
            scoredAnswers: scoredAnswers,  // After reversal
            total: total                   // Total score (range 40–200; higher = more procrastination)
        };
    }

    return {
        render: render,
        validate: validate
    };
})();
