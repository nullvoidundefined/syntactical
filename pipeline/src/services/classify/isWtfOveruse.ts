// A bank where `wtf` is more than a fifth of its questions is flagged: `wtf` is the
// catch-all topic, so a high share means the classifier is dodging the real topics.
const WTF_TOPIC = 'wtf';

const WTF_SHARE_MAX = 0.2;

export function isWtfOveruse(topics: readonly string[]): boolean {
    if (topics.length === 0) {
        return false;
    }
    const wtfCount = topics.filter((topic) => topic === WTF_TOPIC).length;
    return wtfCount / topics.length > WTF_SHARE_MAX;
}
