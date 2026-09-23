/**
 * The past activity every new workspace opens with.
 *
 * The brief wants every dashboard screen to have data on first view, so a
 * workspace is seeded with a few conversations, ratings on some answers and a
 * short list of questions the bot could not answer. Each set carries its own
 * history, because a conversation about refunds makes no sense beside a recipe
 * collection.
 *
 * Citations name a document title and a section rather than ids. The ids only
 * exist once the template has been copied into the session, so each store
 * resolves them with {@link resolveCitations} against its own copies. A test
 * holds every citation here to a real section of its corpus, so editing a
 * heading in the Markdown fails loudly instead of seeding a dead link.
 *
 * Every timestamp sits hours in the past, which keeps the seeded questions out
 * of the per-session chat cap's ten-minute window.
 */
import type { Citation, Corpus, Rating } from '@acb/schemas';

export interface SeedCitation {
  documentTitle: string;
  section: string;
}

export interface SeedExchange {
  question: string;
  answer: string;
  cites: SeedCitation[];
  rating?: Rating;
}

export interface SeedConversation {
  surface: 'preview' | 'widget';
  hoursAgo: number;
  exchanges: SeedExchange[];
}

export interface SeedUnanswered {
  question: string;
  hoursAgo: number;
  email?: string;
}

export interface SeedHistory {
  conversations: SeedConversation[];
  unanswered: SeedUnanswered[];
}

export const HOUR_MS = 3_600_000;
/** The gap between one seeded message and the next inside a conversation. */
export const MESSAGE_GAP_MS = 40_000;

export const SEED_HISTORY: Record<Corpus, SeedHistory> = {
  'saas-help-center': {
    conversations: [
      {
        surface: 'widget',
        hoursAgo: 20,
        exchanges: [
          {
            question: 'How long do I have to ask for a refund?',
            answer:
              'Any charge is refunded in full within 30 days of the payment date. You can ask from the Billing screen or write to the support address on the invoice. [1]',
            cites: [{ documentTitle: 'Refunds and cancellations', section: 'The refund window' }],
            rating: 'up',
          },
          {
            question: 'And if I am on an annual plan?',
            answer:
              'Inside the 30-day window an annual plan is refunded in full. After that it is refunded pro rata for whole unused months, with the current month counted as used. [1]',
            cites: [{ documentTitle: 'Refunds and cancellations', section: 'Refunds on annual plans' }],
            rating: 'up',
          },
        ],
      },
      {
        surface: 'widget',
        hoursAgo: 9,
        exchanges: [
          {
            question: 'I keep getting locked out. What is going on?',
            answer:
              'Ten failed sign-in attempts inside 15 minutes lock an account for 30 minutes. A workspace administrator can clear the lock straight away from the Members screen. [1]',
            cites: [{ documentTitle: 'Passwords and sign-in', section: 'Locked accounts' }],
            rating: 'up',
          },
        ],
      },
      {
        surface: 'widget',
        hoursAgo: 5,
        exchanges: [
          {
            question: 'Can I pay by bank transfer?',
            answer:
              'Bank transfer is accepted on Tidal only. Every plan accepts card payment, charged at 09:00 UTC on the renewal date. [1]',
            cites: [{ documentTitle: 'Billing and plans', section: 'Payment methods' }],
            rating: 'down',
          },
        ],
      },
      {
        surface: 'preview',
        hoursAgo: 2,
        exchanges: [
          {
            question: 'When does a downgrade take effect?',
            answer:
              'A downgrade takes effect at the start of the next billing period, so nothing is lost part way through a month. You cannot downgrade below the number of seats in use. [1]',
            cites: [{ documentTitle: 'Billing and plans', section: 'Changing a plan' }],
          },
        ],
      },
    ],
    unanswered: [
      { question: 'Do you support SAML single sign-on?', hoursAgo: 16, email: 'priya@example.com' },
      { question: 'What is your uptime guarantee?', hoursAgo: 7 },
      { question: 'Which data centre region hosts my workspace?', hoursAgo: 3 },
    ],
  },
  recipes: {
    conversations: [
      {
        surface: 'widget',
        hoursAgo: 19,
        exchanges: [
          {
            question: 'Why did my loaf come out flat?',
            answer: 'A loaf that spreads flat was over-proved. Shorten the final rise by a third next time. [1]',
            cites: [{ documentTitle: 'Breads', section: 'Troubleshooting' }],
            rating: 'up',
          },
          {
            question: 'How long does the overnight hearth loaf rest?',
            answer:
              'Leave it covered at room temperature for 12 hours, until the surface is domed and bubbled, then shape it and rest it for another 45 minutes. [1]',
            cites: [{ documentTitle: 'Breads', section: 'Overnight hearth loaf' }],
            rating: 'up',
          },
        ],
      },
      {
        surface: 'widget',
        hoursAgo: 8,
        exchanges: [
          {
            question: 'How do I know when jam has set?',
            answer:
              'Jam sets at 105 C. Without a thermometer, spoon a little onto a cold saucer, wait 30 seconds and push it with a finger: a set will wrinkle. [1]',
            cites: [{ documentTitle: 'Preserves', section: 'Setting point' }],
            rating: 'up',
          },
        ],
      },
      {
        surface: 'widget',
        hoursAgo: 4,
        exchanges: [
          {
            question: 'Can I reheat the green soup tomorrow?',
            answer: 'The nine-minute green soup does not reheat well, so make only what will be eaten. [1]',
            cites: [{ documentTitle: 'Weeknight suppers', section: 'Nine-minute green soup' }],
            rating: 'down',
          },
        ],
      },
      {
        surface: 'preview',
        hoursAgo: 2,
        exchanges: [
          {
            question: 'How many does the fish pie serve?',
            answer: 'The Thistledown fish pie serves 4. [1]',
            cites: [{ documentTitle: 'Weeknight suppers', section: 'Thistledown fish pie' }],
          },
        ],
      },
    ],
    unanswered: [
      { question: 'What wine goes with fish pie?', hoursAgo: 15, email: 'sam@example.com' },
      { question: 'How many calories are in the green soup?', hoursAgo: 6 },
      { question: 'Do you have a chocolate cake recipe?', hoursAgo: 3 },
    ],
  },
  'employee-handbook': {
    conversations: [
      {
        surface: 'widget',
        hoursAgo: 21,
        exchanges: [
          {
            question: 'How many days of paid leave do I get?',
            answer:
              'Every employee gets 28 days of paid leave a year, plus public holidays in the country they are employed in. [1]',
            cites: [{ documentTitle: 'Time off', section: 'Annual leave' }],
            rating: 'up',
          },
          {
            question: 'Can I carry unused days over?',
            answer:
              'Up to 5 unused days carry into the next year and must be used by 31 March. Anything above 5 is lost at the year end. [1]',
            cites: [{ documentTitle: 'Time off', section: 'Annual leave' }],
            rating: 'up',
          },
        ],
      },
      {
        surface: 'widget',
        hoursAgo: 10,
        exchanges: [
          {
            question: 'What is the hotel cap in London?',
            answer:
              'Hotels are capped at 220 dollars a night in London, New York and Zurich. Anything above the cap needs a reason on the claim. [1]',
            cites: [{ documentTitle: 'Expenses', section: 'Travel' }],
            rating: 'up',
          },
        ],
      },
      {
        surface: 'widget',
        hoursAgo: 5,
        exchanges: [
          {
            question: 'Does the equipment budget cover a phone?',
            answer: 'No. The equipment budget covers a desk, a chair, a monitor and peripherals, and does not cover a phone. [1]',
            cites: [{ documentTitle: 'Expenses', section: 'Equipment' }],
            rating: 'down',
          },
        ],
      },
      {
        surface: 'preview',
        hoursAgo: 2,
        exchanges: [
          {
            question: 'What are the core hours?',
            answer: 'Core hours are 11:00 to 15:00 UK time, and meetings are scheduled inside them. [1]',
            cites: [{ documentTitle: 'Remote work', section: 'Core hours' }],
          },
        ],
      },
    ],
    unanswered: [
      { question: 'What is the bonus scheme?', hoursAgo: 14, email: 'alex@example.com' },
      { question: 'Which pension provider do you use?', hoursAgo: 6 },
      { question: 'How many shares do new joiners get?', hoursAgo: 3 },
    ],
  },
};

/** A seeded document and its chunks, as a store holds them once the template is copied. */
export interface SeededSource {
  documentId: string;
  documentTitle: string;
  chunks: { chunkId: string; section: string }[];
}

/**
 * Turns title-and-section citations into the ids of this session's copies,
 * numbered in order. A citation with no matching section is dropped rather
 * than pointing at nothing.
 */
export function resolveCitations(cites: SeedCitation[], sources: SeededSource[]): Citation[] {
  const citations: Citation[] = [];
  for (const cite of cites) {
    const source = sources.find((s) => s.documentTitle === cite.documentTitle);
    const chunk = source?.chunks.find((c) => c.section === cite.section);
    if (!source || !chunk) continue;
    citations.push({
      index: citations.length + 1,
      documentId: source.documentId,
      documentTitle: source.documentTitle,
      section: chunk.section,
      chunkId: chunk.chunkId,
    });
  }
  return citations;
}
