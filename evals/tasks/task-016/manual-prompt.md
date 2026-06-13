# Manual Prompt — task-016

Add a loading state to all form submit buttons. In src/components/SubmitButton.tsx, add an isLoading prop. When true, show a Spinner icon (from lucide-react) with an animate-spin class inside the button, and disable the button. Update all forms to pass isLoading from their mutation state.
