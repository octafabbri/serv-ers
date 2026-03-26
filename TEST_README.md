# Testing Guide for Serv

This project uses **Vitest** and **React Testing Library** for automated testing.

## Running Tests

```bash
# Run tests in watch mode (recommended during development)
npm test

# Run tests once and exit
npm run test:run

# Run tests with UI dashboard
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Unit Tests

- **`services/serviceRequestService.test.ts`**
  - Service request creation and validation
  - Required field validation
  - Scheduled appointment validation
  - User profile integration

- **`services/userProfileService.test.ts`**
  - Profile loading from localStorage
  - Profile saving and persistence
  - Mood entry management
  - Data corruption handling

### Component Tests

- **`components/SettingsPage.test.tsx`**
  - Voice selection functionality
  - Settings persistence
  - Cancel/revert behavior
  - Voice list validation

## What's Tested

✅ **Service Request Workflow**
- Creating new requests
- Validating required fields (driver name, phone, location, vehicle details)
- Handling different urgency types (ERS, DELAYED, SCHEDULED)
- Scheduled appointment validation

✅ **User Profile Management**
- Loading profiles from localStorage
- Saving settings changes
- Adding mood entries
- Handling corrupted data gracefully

✅ **Settings Page**
- Voice selection and persistence
- Language selection
- Save/Cancel functionality
- Change detection

## Adding New Tests

1. Create a `.test.ts` or `.test.tsx` file next to the code you're testing
2. Import testing utilities:
   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { render, screen } from '@testing-library/react';
   ```
3. Write your tests using the `describe`/`it` pattern

Example:
```typescript
describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Test Coverage

Run `npm run test:coverage` to see:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

Coverage reports are generated in the `coverage/` directory.

## Mocked APIs

The test setup mocks:
- `localStorage` - For profile persistence
- `crypto.randomUUID()` - For generating IDs
- Web Speech API - For voice recognition
- Audio API - For TTS playback

These mocks ensure tests run consistently without external dependencies.

## CI/CD Integration

You can add these tests to your CI pipeline:
```yaml
- name: Run tests
  run: npm run test:run
- name: Check coverage
  run: npm run test:coverage
```

## Known Limitations

- Component tests don't test actual voice recognition/TTS (mocked)
- PDF generation tests are not yet implemented
- E2E tests for full conversation flows are not included
- OpenAI API calls are not tested (would require mocking or integration tests)

## Future Test Ideas

- [ ] PDF generation validation
- [ ] Message history management
- [ ] Voice-to-chat transition
- [ ] Auto-listen functionality
- [ ] Service request AI extraction
- [ ] Conversation transcript generation
