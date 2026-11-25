import { describe, expect, it } from 'vitest';
import { parseRawBulletin } from '../bulletinParser';

// Exact text structure from Weekly Schedule (06_01_2026 - 06_07_2026).pdf
const SAMPLE_PDF_TEXT = `
Weekly Schedule (06/01/2026 - 06/07/2026)
Church Services & Parish Announcements
Praise be to Jesus Christ, Now, Always, and Forever!
Weekly Schedule
Date Day Church Services & Activities
6/01/2026 Monday • N/A
6/02/2026 Tuesday • 6:30 PM - Rosary
• 7:00 PM - Holy Qurbana
6/04/2026 Thursday
Feast of the Body and Blood of Christ
• 6:30 PM - Rosary
• 7:00 PM - Holy Qurbana followed by Adoration
6/05/2026 First Friday
• 12:00 PM to 6:30 PM - Silent Adoration
• 6:30 PM - Rosary
• 7:00 PM - Holy Qurbana followed by Adoration
6/06/2026 Saturday • 9:30 AM - Rosary
• 10:00 AM - Holy Qurbana (Fr. Rodolph Wakim) followed by Novena of Mother of Perpetual Help
6/07/2026 Sunday
• 8:00 AM - Holy Qurbana (Fr. Siby Sebastian)
• 9:30 AM - Adoration and Rosary
• 10:00 AM - Holy Qurbana (Fr. Siby Sebastian)
• 4:30 PM Holy Qurbana at Transfiguration Catholic Church, Blythwood, SC

Announcements
• Sunday Qurbana Time Change: Please note that beginning Sunday, June 7, the second Holy Qurbana will be celebrated at 10:00 AM.
• Ward Prayer Meeting: Ward 3 will have a prayer meeting at 7:00 PM, hosted at the residence of Sibi and Ligi on Saturday, June 6.
• Graduation Holy Qurbana – June 14: Our Baccalaureate Holy Qurbana will take place on June 14. Use the link below to participate in the Baccalaureate recognition: https://docs.google.com/forms/d/1yHtsIUzpJjHzuruzuFT1ZL83h1Q4zzU3-w0ntcmpvZ0/edit
• VBS Summer Program: Please mark your calendars for our Vacation Bible School program, happening from June 16–18. If you are able to volunteer to make VBS a fun event for our kids, please use this link:
https://docs.google.com/forms/d/e/1FAIpQLSeXLQRkam8I9M_S0eWyUygKyHebz3OzPIwl_gCtBGJyaRvejA/viewform?
usp=publish-editor
• Sunday Collection: The total collection for Sunday, May 24 was $462.
• Sunday Lunch Program: Here is the link to sign up for Sunday lunch program for next year:
• https: //docs.google.com/forms/d/1mukLEikLdzj8LGTdcj8sMab4l5Gli3mMwEtf_Fq1-v8/edit
• CCD Day Video and Pictures: Please use the following link to view pictures and video from CCD Day:
https://drive.google.com/drive/folders/1tMkKXrVA1egU5_YZrfKpSM03615igfJZ

With Prayers,
Fr. Rajeev Valiyaveettil
Vicar, St. Mary's Syro Malabar Catholic Church
`;

describe('parseRawBulletin', () => {
  it('parses week dates, greeting, daily schedule, announcements, orphan URLs, wrapped URLs, and collection', () => {
    const parsed = parseRawBulletin(SAMPLE_PDF_TEXT);

    expect(parsed.weekStart).toBe('2026-06-01');
    expect(parsed.weekEnd).toBe('2026-06-07');
    expect(parsed.greeting).toBe('Praise be to Jesus Christ, Now, Always, and Forever!');

    // Daily schedule rows
    expect(parsed.dailySchedule).toHaveLength(6);
    expect(parsed.dailySchedule[2].feastNote).toBe('Feast of the Body and Blood of Christ');
    expect(parsed.dailySchedule[4].items[1].celebrant).toBe('Fr. Rodolph Wakim');

    // Collection extracted out of announcements
    expect(parsed.collectionSummary).toEqual({
      label: 'Sunday Collection (May 24)',
      amountDisplay: '$462.00',
    });

    // 6 announcement cards (7 bullets minus Sunday Collection, orphan URL folded into Sunday Lunch Program)
    expect(parsed.announcements).toHaveLength(6);

    const wardCard = parsed.announcements.find((a) => a.title.includes('Ward Prayer'));
    expect(wardCard?.category).toBe('Parish Events & Wards');
    expect(wardCard?.locationLabel).toContain('Sibi and Ligi');

    // Line-wrapped VBS URL rejoined intact
    const vbsCard = parsed.announcements.find((a) => a.title.includes('VBS'));
    expect(vbsCard?.actions[0]?.url).toBe(
      'https://docs.google.com/forms/d/e/1FAIpQLSeXLQRkam8I9M_S0eWyUygKyHebz3OzPIwl_gCtBGJyaRvejA/viewform?usp=publish-editor'
    );

    // Orphan "https: //" URL bullet repaired and attached to Sunday Lunch Program
    const lunchCard = parsed.announcements.find((a) => a.title.includes('Sunday Lunch'));
    expect(lunchCard?.actions[0]?.kind).toBe('form');
    expect(lunchCard?.actions[0]?.url).toBe(
      'https://docs.google.com/forms/d/1mukLEikLdzj8LGTdcj8sMab4l5Gli3mMwEtf_Fq1-v8/edit'
    );

    // Google Drive folder link detected
    const ccdCard = parsed.announcements.find((a) => a.title.includes('CCD Day'));
    expect(ccdCard?.actions[0]?.kind).toBe('drive');
  });

  it('cleanses unwanted bullets, invisible spaces, and repeated spaces from titles while keeping description bold/highlight markers', () => {
    const messy = `Announcements
▪\u00A0  1.  **Choir   Practice**:   Please attend **Thursday at 7:00 PM** at ==Main Church== .
➤   •  Youth   Retreat:   Bring   your  ==signed form==  by Friday.`;

    const parsed = parseRawBulletin(messy);
    expect(parsed.announcements).toHaveLength(2);
    expect(parsed.announcements[0].title).toBe('Choir Practice');
    expect(parsed.announcements[0].body).toBe(
      'Please attend **Thursday at 7:00 PM** at ==Main Church==.'
    );
    expect(parsed.announcements[1].title).toBe('Youth Retreat');
    expect(parsed.announcements[1].body).toBe('Bring your ==signed form== by Friday.');
  });
});
