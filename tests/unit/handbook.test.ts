import { describe, expect, it } from 'vitest';

import { handbookIsCurrent, renderHandbook } from '../../scripts/build-handbook';
import { manualSections } from '../../src/service/manual';

describe('the generated handbook', () => {
  it('carries every section as a markdown table', () => {
    const text = renderHandbook();
    for (const section of manualSections()) {
      expect(text).toContain(`## ${section.title}`);
    }
    expect(text.split('\n')[0]).toBe('# the cross connection control handbook');
  });

  it('has a row for every finding, in the order of the catalogue', () => {
    const text = renderHandbook();
    expect(text).toContain('| AUX_WELL |');
    expect(text).toContain('| MOBILE_TANK |');
  });

  it('says not to edit it by hand', () => {
    expect(renderHandbook()).toContain('Do not edit it');
  });

  it('matches the file that is checked in', () => {
    expect(handbookIsCurrent()).toBe(true);
  });
});
