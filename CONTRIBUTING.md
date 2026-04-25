# Contributing to Agora Conversational AI Next.js Quickstart

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

### Prerequisites

- Node.js 22 or higher (see `engines` in `package.json`)
- pnpm 8.x or higher
- An Agora account with Conversational AI enabled

### Development Setup

1. Fork and clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/agent-quickstart-nextjs.git
cd agent-quickstart-nextjs
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up your environment variables:

```bash
cp env.local.example .env.local
```

Use the Agora CLI to create or select a project, then copy the exported values into `.env.local` using the variable names from `env.local.example`:

```bash
agora login
agora project create my-first-voice-agent --feature rtc --feature convoai
agora project use my-first-voice-agent
agora project env --with-secrets
```

Map:
- `NEXT_PUBLIC_AGORA_APP_ID=<AGORA_APP_ID>`
- `NEXT_AGORA_APP_CERTIFICATE=<AGORA_APP_CERTIFICATE>`

4. Start the development server:

```bash
pnpm dev
```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or fix:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following our coding standards (see below)

3. Test your changes locally:

```bash
pnpm run verify
```

4. Commit your changes with a clear, descriptive commit message

5. Push to your fork and create a Pull Request

### Coding Standards

- **TypeScript**: All new code must be written in TypeScript
- **Formatting**: Follow the existing code style and keep `pnpm run lint` clean
- **Linting**: Ensure your code passes ESLint checks (`pnpm run lint`)
- **Comments**: Add comments for non-obvious patterns, especially:
  - StrictMode guards and React lifecycle patterns
  - Agora SDK-specific requirements
  - Security considerations
  - Performance optimizations

### Component Guidelines

- Use functional components with hooks
- Follow the existing patterns for Agora SDK integration:
  - `isReady` guard for StrictMode safety
  - Hook ownership (don't manually call `client.leave()`, etc.)
  - Proper cleanup in `useEffect` returns
- Keep components focused and single-purpose
- Use TypeScript interfaces for props

### API Route Guidelines

- Validate all inputs
- Use proper HTTP status codes
- Include clear error messages
- Log errors with context
- Never expose sensitive credentials in responses

## Pull Request Process

1. **Title**: Use a clear, descriptive title
   - Good: "Add support for Azure OpenAI endpoints"
   - Bad: "Update code"

2. **Description**: Include:
   - What changes you made and why
   - How to test the changes
   - Any breaking changes
   - Screenshots for UI changes

3. **Review**: Wait for maintainer review
   - Address feedback promptly
   - Keep discussions focused and professional

4. **Merge**: Once approved, a maintainer will merge your PR

## What to Contribute

### Good First Issues

- Documentation improvements
- Error message clarity
- Additional examples in GUIDE.md
- UI/UX enhancements
- Accessibility improvements

### Feature Contributions

Before starting work on a major feature:
1. Open an issue to discuss the feature
2. Wait for maintainer feedback
3. Ensure it aligns with the project's goals

### Bug Fixes

- Include steps to reproduce the bug
- Add a test case if possible
- Explain the root cause in your PR description

## Documentation

When changing implementation:
- Update relevant sections in `README.md`
- Update `DOCS/GUIDE.md` if the change affects the tutorial
- Update `AGENTS.md` if the architecture changes
- Keep code comments in sync with the code

## Testing

This project ships with a verification workflow:

```bash
pnpm run doctor
pnpm run verify:api
pnpm run verify
```

Use `pnpm run verify` before opening a PR. `pnpm run verify:api` is the narrower check for server-route contract changes.

## Questions?

- Open an issue for questions about contributing
- Check existing issues and PRs for similar discussions
- Review `AGENTS.md` for the project architecture overview

## Code of Conduct

- Be respectful and professional
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
