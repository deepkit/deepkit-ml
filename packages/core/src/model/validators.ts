/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {PropertyValidatorError} from "@marcj/marshal";

export class Validators {
    static username(value: string): PropertyValidatorError | void {
        if (value.length < 3) return new PropertyValidatorError('too_short', 'At least 3 characters');
        if (!value.match(/^[a-zA-Z0-9_\-]+$/)) return new PropertyValidatorError('invalid_characters', 'Invalid characters');
    }

    static password(value: any): PropertyValidatorError | void {
        if (value.length < 3) return new PropertyValidatorError('too_short', 'At least 3 characters');
    }

    static email(value: any): PropertyValidatorError | void {
        if (value && !value.match(/^\S+@\S+$/)) return new PropertyValidatorError('no_email', 'No valid email address');
    }
}
