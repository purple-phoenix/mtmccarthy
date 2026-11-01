"""Projects and case studies: content/projects.json validation and rendering."""
import copy
import html
import json

import pytest

import app as site
from conftest import PROJECT_ROOT


def real_projects():
    return json.loads((PROJECT_ROOT / 'content' / 'projects.json').read_text(encoding='utf-8'))


def case_studies():
    return [p for p in real_projects() if p.get('case_study')]


def page_text(client, path):
    response = client.get(path)
    assert response.status_code == 200, path
    return html.unescape(response.get_data(as_text=True))


VALID_STUDY = {
    'slug': 'study',
    'title': 'A Study',
    'description': 'What it is.',
    'repo_visibility': 'private',
    'case_study': {
        'strengths': ['evaluation'],
        'summary': 'One line.',
        'problem': ['Why.'],
        'constraints': ['Limits.'],
        'built': ['What.'],
        'verification': ['How we know.'],
        'results': ['What happened.'],
        'metrics': [{'value': '3', 'label': 'things'}],
        'todos': ['A number only Matt has.'],
    },
}


@pytest.fixture
def projects_file(tmp_path, monkeypatch):
    """Point the app at a temporary projects.json holding the given entries."""
    def _write(entries):
        path = tmp_path / 'projects.json'
        path.write_text(json.dumps(entries), encoding='utf-8')
        monkeypatch.setattr(site, 'PROJECTS_FILE', str(path))
        return path
    return _write


def test_real_projects_json_has_case_studies():
    # load_projects() validates every entry and raises on the first problem.
    assert len([p for p in site.load_projects() if p.get('case_study')]) >= 1


def test_projects_page_lists_every_case_study_and_strength(client):
    text = page_text(client, '/projects')
    for label in site.CASE_STUDY_STRENGTHS.values():
        assert label in text
    for study in case_studies():
        assert study['title'] in text
        assert f'/projects/{study["slug"]}' in text


@pytest.mark.parametrize('slug', [p['slug'] for p in case_studies()])
def test_case_study_page_renders_every_section(client, slug):
    study = next(p for p in case_studies() if p['slug'] == slug)
    text = page_text(client, f'/projects/{slug}')
    for heading in ('The problem', 'Constraints', 'What I built', "How it's verified", 'Results'):
        assert heading in text
    for metric in study['case_study'].get('metrics', []):
        assert metric['value'] in text
    for todo in study['case_study'].get('todos', []):
        assert f'TODO: {todo}' in text


@pytest.mark.parametrize('slug', [p['slug'] for p in real_projects()
                                  if p.get('repo_visibility') in ('private', 'local')])
def test_unpublished_repos_are_never_linked(client, slug):
    project = next(p for p in real_projects() if p['slug'] == slug)
    assert 'github_url' not in project
    assert 'github.com' not in page_text(client, f'/projects/{slug}').split('<footer', 1)[0]


def test_todos_render_visibly(client, projects_file):
    projects_file([VALID_STUDY])
    text = page_text(client, '/projects/study')
    assert 'data-todo' in text
    assert 'TODO: A number only Matt has.' in text


def test_case_study_without_todos_has_no_todo_box(client, projects_file):
    study = copy.deepcopy(VALID_STUDY)
    del study['case_study']['todos']
    projects_file([study])
    assert 'data-todo' not in page_text(client, '/projects/study')


@pytest.mark.parametrize('mutate, message', [
    (lambda p: p.update(github_url='https://github.com/x/y'), 'github_url'),
    (lambda p: p['case_study'].pop('verification'), 'case_study.verification'),
    (lambda p: p['case_study'].update(results=[]), 'case_study.results'),
    (lambda p: p['case_study'].update(strengths=['vibes']), 'strengths'),
    (lambda p: p['case_study'].update(summary=' '), 'summary'),
    (lambda p: p['case_study'].update(metrics=[{'value': '1'}]), 'metrics'),
    (lambda p: p.pop('repo_visibility'), 'repo_visibility'),
    (lambda p: p.update(repo_visibility='secret'), 'repo_visibility'),
    (lambda p: p.update(related=['missing']), 'related'),
    (lambda p: p['case_study'].update(related=[]), 'top level'),
])
def test_invalid_case_study_fails_loudly(projects_file, mutate, message):
    study = copy.deepcopy(VALID_STUDY)
    mutate(study)
    projects_file([study])
    with pytest.raises(ValueError, match=message):
        site.load_projects()


def test_public_repo_may_be_linked(client, projects_file):
    study = copy.deepcopy(VALID_STUDY)
    study.update(repo_visibility='public', github_url='https://github.com/x/y')
    projects_file([study])
    assert 'https://github.com/x/y' in page_text(client, '/projects/study')


def test_related_projects_render(client, projects_file):
    other = copy.deepcopy(VALID_STUDY)
    other.update(slug='other', title='Other Study')
    study = copy.deepcopy(VALID_STUDY)
    study['related'] = ['other']
    projects_file([study, other])
    text = page_text(client, '/projects/study')
    assert 'Related case studies' in text
    assert '/projects/other' in text
