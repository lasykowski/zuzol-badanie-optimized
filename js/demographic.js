/**
 * demographic.js
 * Handles the demographic data form: age, gender, education, ADHD diagnosis, ADHD medication.
 */

const DemographicModule = (function () {
    'use strict';

    /**
     * Validates the demographic form and returns collected data or null if invalid.
     * @returns {Object|null}
     */
    function validate() {
        let isValid = true;

        // Clear previous errors
        clearErrors();

        // Age
        const ageInput = document.getElementById('age');
        const age = parseInt(ageInput.value, 10);
        if (!ageInput.value || isNaN(age) || age < 18 || age > 99) {
            showError('age-error', 'Proszę podać wiek (18–99 lat).');
            ageInput.classList.add('input-error');
            isValid = false;
        }

        // Gender
        const gender = getRadioValue('gender');
        if (!gender) {
            showError('gender-error', 'Proszę wybrać płeć.');
            isValid = false;
        }

        // Education
        const educationSelect = document.getElementById('education');
        const education = educationSelect.value;
        if (!education) {
            showError('education-error', 'Proszę wybrać wykształcenie.');
            educationSelect.classList.add('input-error');
            isValid = false;
        }

        // ADHD Diagnosis
        const adhdDiagnosis = getRadioValue('adhd-diagnosis');
        if (!adhdDiagnosis) {
            showError('adhd-diagnosis-error', 'Proszę odpowiedzieć na to pytanie.');
            isValid = false;
        }

        // ADHD Medication
        const adhdMedication = getRadioValue('adhd-medication');
        if (!adhdMedication) {
            showError('adhd-medication-error', 'Proszę odpowiedzieć na to pytanie.');
            isValid = false;
        }

        if (!isValid) {
            // Scroll to first error
            const firstError = document.querySelector('.error-msg:not(:empty)');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return null;
        }

        return {
            age: age,
            gender: gender,
            education: education,
            adhdDiagnosis: adhdDiagnosis,
            adhdMedication: adhdMedication
        };
    }

    /**
     * Gets the value of a checked radio button by name.
     */
    function getRadioValue(name) {
        const checked = document.querySelector('input[name="' + name + '"]:checked');
        return checked ? checked.value : null;
    }

    /**
     * Shows an error message.
     */
    function showError(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = message;
    }

    /**
     * Clears all error messages in the demographic form.
     */
    function clearErrors() {
        const errorMsgs = document.querySelectorAll('#demographic .error-msg');
        errorMsgs.forEach(function (el) { el.textContent = ''; });

        const errorInputs = document.querySelectorAll('#demographic .input-error');
        errorInputs.forEach(function (el) { el.classList.remove('input-error'); });
    }

    /**
     * Initializes the demographic form event listeners.
     */
    function init(onSubmitCallback) {
        const form = document.getElementById('demographic-form');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const data = validate();
            if (data && typeof onSubmitCallback === 'function') {
                onSubmitCallback(data);
            }
        });

        // Clear individual errors on input change
        document.getElementById('age').addEventListener('input', function () {
            this.classList.remove('input-error');
            document.getElementById('age-error').textContent = '';
        });

        document.getElementById('education').addEventListener('change', function () {
            this.classList.remove('input-error');
            document.getElementById('education-error').textContent = '';
        });

        ['gender', 'adhd-diagnosis', 'adhd-medication'].forEach(function (name) {
            const radios = document.querySelectorAll('input[name="' + name + '"]');
            radios.forEach(function (radio) {
                radio.addEventListener('change', function () {
                    document.getElementById(name + '-error').textContent = '';
                });
            });
        });
    }

    return {
        init: init,
        validate: validate
    };
})();
