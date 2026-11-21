/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Who is allowed to see the Admin buttons.
 *
 * The contract decides. `isManager` is true for the manager role and for the
 * admin role (the address that deployed the shares). A person who only holds
 * shares is an investor. The page must not offer allowlist, rent deposit, or
 * share transfers to them.
 *
 * Before a property contract exists, nobody is the manager yet. The account
 * that deploys becomes the manager, so the deploy button is the one admin
 * action that is offered in that empty state.
 */
export type PropertyRole = 'manager' | 'investor' | 'not-deployed';

export function propertyRole(input: { propertyDeployed: boolean; youAreManager: boolean }): PropertyRole {
  if (!input.propertyDeployed) return 'not-deployed';
  return input.youAreManager ? 'manager' : 'investor';
}

/** Allow, freeze, give shares, and deposit rent. */
export function adminActionsAllowed(role: PropertyRole): boolean {
  return role === 'manager';
}

/** Creating the contracts. After they exist, only the manager deploys again. */
export function deployAllowed(role: PropertyRole): boolean {
  return role === 'not-deployed' || role === 'manager';
}
