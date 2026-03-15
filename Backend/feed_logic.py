def get_custom_feed(feed):
    """Transform the raw feed before it is returned to the browser extension.

    This is the main customisation point for your study. The feed dict contains
    the full JSON payload that X's API sent to the participant's browser. You can
    reorder, filter, or augment it here before it is rendered.

    RESEARCHERS: Replace the pass-through below with your own logic, for example:
        - Rerank posts by a custom score (sentiment, toxicity, topic relevance)
        - Remove posts matching certain criteria
        - Inject additional posts into the list
        - Add labels or metadata to individual posts

    Args:
        feed (dict): The 'feed_info' payload forwarded by the browser extension.
                     Contains at minimum:
                         id        -- unique request ID
                         url       -- original API URL
                         startTime -- ISO timestamp of the request
                         type      -- endpoint name (e.g. "HomeTimeline")
                         response  -- raw JSON string from X's API

    Returns:
        dict: The (possibly modified) feed dict. Must preserve the 'response'
              key, as the extension reads feed["response"] to reconstruct the
              HTTP response body delivered to X's frontend.
    """
    # Default behaviour: return the feed unchanged (observation-only / passthrough).
    return feed
