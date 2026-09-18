package com.ricard0g.jobtrackr_api.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class PasswordPolicyValidator implements ConstraintValidator<ValidPassword, String> {

    @Override
    public boolean isValid(final String password, final ConstraintValidatorContext context) {
        if (password == null) {
            return true;
        }

        if (PasswordPolicy.isTooShort(password)) {
            replaceMessage(context, PasswordPolicy.TOO_SHORT_MESSAGE);
            return false;
        }

        if (PasswordPolicy.exceedsBcryptLimit(password)) {
            replaceMessage(context, PasswordPolicy.TOO_LONG_MESSAGE);
            return false;
        }

        return true;
    }

    private static void replaceMessage(final ConstraintValidatorContext context, final String message) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(message).addConstraintViolation();
    }
}
