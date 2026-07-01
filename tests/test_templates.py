"""Rendering of blog post pages, with and without a hero image."""


def test_post_with_hero_image_renders_img(client, make_post):
    make_post('with-image', title='Post With Image',
              image_url='/static/images/profile.jpg')

    html = client.get('/blog/with-image').get_data(as_text=True)

    assert 'src="/static/images/profile.jpg"' in html
    assert 'Post With Image' in html


def test_post_without_hero_image_has_no_hero_img(client, make_post):
    make_post('no-image', title='Post Without Image', body='Plain text body.')

    html = client.get('/blog/no-image').get_data(as_text=True)

    assert 'Post Without Image' in html
    # The hero <img> block is the only w-full h-auto image in blog_post.html.
    assert 'class="w-full h-auto"' not in html


def test_post_body_markdown_is_rendered(client, make_post):
    make_post('rich-post', title='Rich Post',
              body='Some **bold** text.\n\n```python\nprint("hi")\n```')

    html = client.get('/blog/rich-post').get_data(as_text=True)

    assert '<strong>bold</strong>' in html
    assert 'codehilite' in html


def test_post_metadata_shown_in_header(client, make_post):
    make_post('meta-post', title='Meta Post', date='2024-05-01')

    html = client.get('/blog/meta-post').get_data(as_text=True)

    assert 'May 01, 2024' in html
    assert 'Testing' in html          # category badge
    assert '3 min read' in html       # read_time
    assert 'An excerpt' in html


def test_prev_next_navigation_links(client, make_post):
    make_post('older-post', title='Older Post', date='2024-01-01')
    make_post('newer-post', title='Newer Post', date='2024-02-01')

    html = client.get('/blog/newer-post').get_data(as_text=True)

    assert '/blog/older-post' in html


def test_blog_index_lists_posts(client, make_post):
    make_post('listed-post', title='Listed Post')

    html = client.get('/blog').get_data(as_text=True)

    assert 'Listed Post' in html
    assert '/blog/listed-post' in html
