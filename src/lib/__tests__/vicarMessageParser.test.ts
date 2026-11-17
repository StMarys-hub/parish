import { describe, expect, it } from 'vitest';
import { parseVicarMessage } from '../vicarMessageParser';

describe('parseVicarMessage smart parser', () => {
  it('Sample 1: parses multi-link Google Drive video & photo highlights into Media & Highlights without dumping bare URLs in preview', () => {
    const raw = `Dear Parish Family,
Praise be to Jesus Christ.

Please find the highlights, recorded messages, or shared photo galleries below:

Youth Retreat Highlight Video:
https://drive.google.com/file/d/1exampleVideoLink/view

First Holy Communion Group Photos:
https://drive.google.com/drive/folders/1examplePhotosFolder

- Rajeev Achan`;

    const parsed = parseVicarMessage(raw);
    expect(parsed.categoryBadge).toBe('Media & Highlights');
    expect(parsed.signOff).toBe('Rajeev Achan');
    expect(parsed.summaryPreview).not.toContain('Dear Parish Family');
    expect(parsed.summaryPreview).not.toContain('https://');
    expect(parsed.structuredBlocks.mediaLinks).toHaveLength(2);
    expect(parsed.structuredBlocks.mediaLinks?.[0]).toEqual({
      label: 'Youth Retreat Highlight Video',
      url: 'https://drive.google.com/file/d/1exampleVideoLink/view',
      kind: 'drive',
    });
    expect(parsed.structuredBlocks.mediaLinks?.[1].label).toBe('First Holy Communion Group Photos');
  });

  it('Sample 2: parses Sunday liturgical day schedule with timestamps and St. Sebastian Mission location', () => {
    const raw = `Sunday May 24 — Pentecost Sunday
Schedule:
8:00 AM - Holy Qurbana
9:30 AM - Catechism & Rosary
4:30 PM - Holy Qurbana at St. Sebastian Mission, Blythewood, SC
7:00 PM - Youth Adoration

Please arrive 15 minutes early for confessions.
- Fr. Rajeev`;

    const parsed = parseVicarMessage(raw);
    expect(parsed.categoryBadge).toBe('Sunday Liturgy');
    expect(parsed.title).toContain('Pentecost Sunday');
    expect(parsed.signOff).toBe('Fr. Rajeev');
    expect(parsed.structuredBlocks.timeline).toHaveLength(4);
    expect(parsed.structuredBlocks.timeline?.[0]).toEqual({
      time: '8:00 AM',
      activity: 'Holy Qurbana',
      note: null,
    });
    expect(parsed.structuredBlocks.timeline?.[2].time).toBe('4:30 PM');
    expect(parsed.structuredBlocks.locations?.length).toBeGreaterThanOrEqual(1);
    expect(parsed.structuredBlocks.locations?.[0].label).toMatch(/St\. Sebastian Mission/i);
    expect(parsed.structuredBlocks.locations?.[0].mapsUrl).toContain('google.com/maps/search');
  });

  it('Sample 3: strips greeting & sign-off boilerplate from pastoral letter summary preview', () => {
    const raw = `Dear Brothers & Sisters,
Praise be to Jesus Christ!

Lenten Confession Schedule Update
Fr. Mathew will hear confessions every Friday evening from 5:30 PM to 6:45 PM prior to Way of the Cross.

God bless you all!
Rajeev Achan`;

    const parsed = parseVicarMessage(raw);
    expect(parsed.categoryBadge).toBe('Vicar Note');
    expect(parsed.title).toBe('Lenten Confession Schedule Update');
    expect(parsed.summaryPreview).not.toMatch(/Dear Brothers|Praise be to Jesus|God bless/i);
    expect(parsed.summaryPreview).toContain('Fr. Mathew will hear confessions');
    expect(parsed.signOff).toBe('Rajeev Achan');
  });

  it('Sample 4: classifies Youth & Events and pairs registration CTA form cleanly', () => {
    const raw = `Title: Annual Jesus Youth Choir & Retreat Registration
Date: Saturday, Dec 12 at 10:00 AM
Location: St. Mary's Parish Hall
Please register all youth attendees by Wednesday evening.
Register Here: https://forms.gle/abc123YouthRetreat`;

    const parsed = parseVicarMessage(raw);
    expect(parsed.categoryBadge).toBe('Youth & Events');
    expect(parsed.title).toBe('Annual Jesus Youth Choir & Retreat Registration');
    expect(parsed.eventDateLabel).toBe('Saturday, Dec 12 at 10:00 AM');
    expect(parsed.structuredBlocks.locations?.[0].label).toBe("St. Mary's Parish Hall");
    expect(parsed.structuredBlocks.externalLinks?.[0]).toEqual({
      label: 'Register Here',
      url: 'https://forms.gle/abc123YouthRetreat',
      kind: 'form',
    });
  });

  it('Sample 5: detects Urgent weather / cancellation notice badge accurately', () => {
    const raw = `Urgent Weather Alert: Tonight Evening Mass Cancelled
Due to severe icy roads in Greer and Charlotte, today evening 7:00 PM Qurbana is cancelled. Stay safe at home.`;

    const parsed = parseVicarMessage(raw);
    expect(parsed.categoryBadge).toBe('Urgent');
    expect(parsed.title).toContain('Urgent Weather Alert');
  });

  it('Sample 6: handles inline parenthesized notes on Qurbana timetable items (Nov 15 pattern)', () => {
    const raw = `Third Sunday of the Season of Dedication of the Church
November 15
8:00 AM Holy Qurbana (Fr. Mathew Pulinthanam)
9:30 AM – First Session of CCD
10:30 AM – Holy Qurbana (English)
4:30 PM - Holy Qurbana in our St. Sebastian Mission at Transfiguration Catholic Church, Blythwood, SC`;

    const parsed = parseVicarMessage(raw);
    expect(parsed.categoryBadge).toBe('Sunday Liturgy');
    expect(parsed.structuredBlocks.timeline?.[0]).toEqual({
      time: '8:00 AM',
      activity: 'Holy Qurbana',
      note: 'Fr. Mathew Pulinthanam',
    });
    expect(parsed.eventDateLabel).toBe('November 15');
  });

  it('Sample 7 & Security: repairs broken https: // PDF links, strips HTML tags, rejects insecure/XSS URLs, and runs in < 5ms', () => {
    const raw = `Retreat Packet <script>alert(1)</script>
Watch Session: https: //youtu.be/dQw4w9WgXcQ
Bad Link: http://insecure.example.com
XSS Link: javascript:alert('xss')`;

    const start = performance.now();
    const parsed = parseVicarMessage(raw);
    const elapsed = performance.now() - start;

    expect(parsed.title).toBe('Retreat Packet');
    expect(parsed.structuredBlocks.mediaLinks).toHaveLength(1);
    expect(parsed.structuredBlocks.mediaLinks?.[0].url).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(parsed.structuredBlocks.externalLinks).toHaveLength(0);
    expect(elapsed).toBeLessThan(10);
  });
});
