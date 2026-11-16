import { describe, expect, it } from 'vitest';
import { parseSpecialAnnouncementText } from '../specialAnnouncementParser';

describe('parseSpecialAnnouncementText', () => {
  it('extracts title, event date, location, Google Maps URL, and safe CTA URL from raw WhatsApp text', () => {
    const sample = `
*Special Vicar Notice: Diocesan Youth Retreat*
Date & Time: Sat, Nov 22 at 9:30 AM
Venue: St. Mary's Parish Hall, 715 E Arrowood Rd
Map: https://maps.app.goo.gl/abc123xyz
Dear Parishioners, please encourage all high school and college youth to attend this grace-filled day of reflection.
Register here: https://forms.gle/testretreat99
`;

    const parsed = parseSpecialAnnouncementText(sample);
    expect(parsed.title).toBe('Special Vicar Notice: Diocesan Youth Retreat');
    expect(parsed.eventDateLabel).toBe('Sat, Nov 22 at 9:30 AM');
    expect(parsed.locationLabel).toContain('Parish Hall');
    expect(parsed.mapsUrl).toBe('https://maps.app.goo.gl/abc123xyz');
    expect(parsed.webUrl).toBe('https://forms.gle/testretreat99');
    expect(parsed.webLinkLabel).toBe('Open Registration Form');
    expect(parsed.description).toContain('grace-filled day of reflection');
  });

  it('strips malicious javascript: URLs and HTML tags', () => {
    const dirty = `
<script>alert(1)</script>Urgent Qurbana Schedule Notice
Please arrive 15 minutes early.
javascript:alert('xss')
https://stmarysyroclt.org/events
`;
    const parsed = parseSpecialAnnouncementText(dirty);
    expect(parsed.title).toBe('Urgent Qurbana Schedule Notice');
    expect(parsed.description).not.toContain('<script>');
    expect(parsed.webUrl).toBe('https://stmarysyroclt.org/events');
  });
});
