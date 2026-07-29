/**
 * This historical module path intentionally contains no route loader.
 *
 * `/app/contacts/new` renders an authenticated action workspace. Loading it
 * must not compose acquisition services, select fixture scenarios from URL
 * parameters, or confirm drafts during a GET request. Each acquisition source
 * is invoked only by its explicit authenticated API action.
 *
 * The empty module remains in the typed lint manifest until that manifest is
 * converted from an explicit file list.
 */
export {};
