/**
 * Base CLI error with an actionable hint for the user.
 */
export class DvmiError extends Error {
   /**
    * @param {string} message - Human-readable error message
    * @param {string} hint - Actionable suggestion to resolve the error
    * @param {number} [exitCode] - Process exit code (default: 1)
    */
   constructor(message, hint, exitCode = 1) {
     super(message)
     this.name = 'DvmiError'
    /** @type {string} */
    this.hint = hint
    /** @type {number} */
    this.exitCode = exitCode
  }
}

/**
 * Validation error for invalid user input (exit code 2).
 */
export class ValidationError extends DvmiError {
   /**
    * @param {string} message
    * @param {string} hint
    */
   constructor(message, hint) {
     super(message, hint, 2)
     this.name = 'ValidationError'
     // oclif reads this.oclif.exit to determine the process exit code
     this.oclif = { exit: 2 }
   }
 }

 /**
  * Auth error for missing or expired authentication.
  */
 export class AuthError extends DvmiError {
   /**
    * @param {string} service - Service name (e.g. "GitHub", "AWS")
    */
   constructor(service) {
     super(
       `${service} authentication required`,
       `Run \`dvmi auth login\` to authenticate`,
       1,
     )
     this.name = 'AuthError'
   }
 }

 /**
  * Format an error for display in the terminal.
  * @param {Error} err
  * @returns {string}
  */
 export function formatError(err) {
   if (err instanceof DvmiError) {
     return `Error: ${err.message}\nHint: ${err.hint}`
   }
   return `Error: ${err.message}`
 }
