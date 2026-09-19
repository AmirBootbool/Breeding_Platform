import pytest

from apps.germplasm.models import Germplasm


@pytest.mark.django_db
def test_germplasm_create(auth_client, program):
    response = auth_client.post(
        "/api/germplasm/",
        {
            "name": "Line 1",
            "program": program.id,
            "species": "Triticum aestivum",
            "cross_type": "unknown",
        },
        format="json",
    )

    assert response.status_code == 201
    assert Germplasm.objects.filter(name="Line 1").exists()


@pytest.mark.django_db
def test_technician_cannot_create_germplasm(client_for_role, program):
    client = client_for_role("technician")

    response = client.post(
        "/api/germplasm/",
        {
            "name": "Line 2",
            "program": program.id,
            "species": "Triticum aestivum",
            "cross_type": "unknown",
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_cross_self_cross_via_api(auth_client, germplasm):
    response = auth_client.post(
        "/api/crosses/",
        {
            "cross_code": "SELF-X",
            "female_parent": germplasm.id,
            "male_parent": germplasm.id,
            "cross_date": "2026-07-03",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "errors" in response.data
    assert "male_parent" in response.data["errors"]


@pytest.mark.django_db
def test_germplasm_db_id_is_server_generated_not_client_settable(auth_client, program, germplasm):
    # germplasm_db_id is read-only: a client-supplied value - duplicate or
    # not - must be silently ignored in favor of the server-generated one,
    # not accepted (which used to let a colliding value reach the database
    # and raise an unhandled IntegrityError instead of a clean response).
    response = auth_client.post(
        "/api/germplasm/",
        {
            "name": "Line 2",
            "program": program.id,
            "germplasm_db_id": germplasm.germplasm_db_id,
            "species": "Triticum aestivum",
            "cross_type": "unknown",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["germplasm_db_id"] != germplasm.germplasm_db_id
    assert response.data["germplasm_db_id"]


@pytest.mark.django_db
def test_selection_shortlist_toggle(auth_client, program, germplasm):
    from apps.germplasm.models import SelectionShortlist

    # Toggle ON
    res_on = auth_client.post(
        "/api/selection-shortlist/toggle/",
        {"germplasm": germplasm.id, "source": "mea"},
        format="json",
    )
    assert res_on.status_code == 201
    assert res_on.data == {"shortlisted": True}
    assert SelectionShortlist.objects.filter(germplasm=germplasm, program=program).exists()

    # Toggle OFF
    res_off = auth_client.post(
        "/api/selection-shortlist/toggle/",
        {"germplasm": germplasm.id},
        format="json",
    )
    assert res_off.status_code == 200
    assert res_off.data == {"shortlisted": False}
    assert not SelectionShortlist.objects.filter(germplasm=germplasm, program=program).exists()


@pytest.mark.django_db
def test_selection_shortlist_toggle_program_isolation(api_client, program, germplasm):
    from django.contrib.auth import get_user_model
    from apps.core.models import Program, UserProfile

    # User in Program B
    program_b = Program.objects.create(name="Program B")
    User = get_user_model()
    user_b = User.objects.create_user(username="breeder_b", password="password12345")
    UserProfile.objects.create(user=user_b, role="breeder", program=program_b)
    api_client.force_authenticate(user=user_b)

    # Attempt to toggle germplasm from Program A
    res = api_client.post(
        "/api/selection-shortlist/toggle/",
        {"germplasm": germplasm.id},
        format="json",
    )
    assert res.status_code == 404

