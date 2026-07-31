import os
import tempfile
from io import StringIO

import pytest

from django.core.management import call_command
from django.core.management.base import CommandError

from apps.core.models import Program
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, Plot


@pytest.fixture
def temp_csv_file():
    fd, path = tempfile.mkstemp(suffix=".csv")
    try:
        os.close(fd)
        yield path
    finally:
        if os.path.exists(path):
            os.remove(path)


@pytest.mark.django_db
def test_import_germplasm_command(program, temp_csv_file):
    # Prepare CSV content
    csv_content = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "New Line 1,Triticum aestivum,NL1/PASTOR,biparental,2024,High yielding line\n"
        "New Line 2,Triticum aestivum,,unknown,,\n"
    )
    with open(temp_csv_file, "w", encoding="utf-8") as f:
        f.write(csv_content)

    out = StringIO()
    err = StringIO()
    call_command(
        "import_germplasm",
        temp_csv_file,
        program=program.name,
        stdout=out,
        stderr=err,
    )

    stdout_val = out.getvalue()
    assert "Created: 2" in stdout_val
    assert "Skipped (Duplicate): 0" in stdout_val
    assert "Errors: 0" in stdout_val

    # Verify records in DB
    assert Germplasm.objects.filter(name="New Line 1", program=program).exists()
    nl1 = Germplasm.objects.get(name="New Line 1")
    assert nl1.species == "Triticum aestivum"
    assert nl1.pedigree_string == "NL1/PASTOR"
    assert nl1.cross_type == "biparental"
    assert nl1.year_developed == 2024
    assert nl1.notes == "High yielding line"
    assert nl1.created_by is None
    assert nl1.updated_by is None

    assert Germplasm.objects.filter(name="New Line 2", program=program).exists()
    nl2 = Germplasm.objects.get(name="New Line 2")
    assert nl2.year_developed is None
    assert nl2.created_by is None
    assert nl2.updated_by is None


@pytest.mark.django_db
def test_import_germplasm_dry_run(program, temp_csv_file):
    # Prepare CSV content
    csv_content = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "Dry Run Line,Triticum aestivum,,unknown,2025,\n"
    )
    with open(temp_csv_file, "w", encoding="utf-8") as f:
        f.write(csv_content)

    out = StringIO()
    call_command(
        "import_germplasm",
        temp_csv_file,
        program=program.name,
        dry_run=True,
        stdout=out,
    )

    stdout_val = out.getvalue()
    assert "Created: 1" in stdout_val
    assert "Dry run complete. No database changes were saved." in stdout_val

    # Verify no records created
    assert not Germplasm.objects.filter(name="Dry Run Line").exists()


@pytest.mark.django_db
def test_import_germplasm_duplicate_skips(program, temp_csv_file):
    # Create existing germplasm
    Germplasm.objects.create(name="Existing Line", program=program)

    # Prepare CSV content
    csv_content = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "Existing Line,Triticum aestivum,,unknown,,\n"
        "New Unique Line,Triticum aestivum,,unknown,,\n"
    )
    with open(temp_csv_file, "w", encoding="utf-8") as f:
        f.write(csv_content)

    out = StringIO()
    call_command(
        "import_germplasm",
        temp_csv_file,
        program=program.name,
        stdout=out,
    )

    stdout_val = out.getvalue()
    assert "Created: 1" in stdout_val
    assert "Skipped (Duplicate): 1" in stdout_val
    assert Germplasm.objects.filter(name="New Unique Line").exists()


@pytest.mark.django_db
def test_import_germplasm_missing_headers_and_program_errors(temp_csv_file):
    # Empty CSV or missing name header
    csv_content = "wrong_header,species\nval1,val2\n"
    with open(temp_csv_file, "w", encoding="utf-8") as f:
        f.write(csv_content)

    with pytest.raises(CommandError) as excinfo:
        call_command("import_germplasm", temp_csv_file, program="NonExistent")
    assert "Program 'NonExistent' does not exist." in str(excinfo.value)

    # Now create the program to test header validation
    prog = Program.objects.create(name="TestProg")
    with pytest.raises(CommandError) as excinfo:
        call_command("import_germplasm", temp_csv_file, program=prog.name)
    assert "CSV is missing required headers" in str(excinfo.value)


@pytest.mark.django_db
def test_export_trial_data_command(
    trial, germplasm, observation_variable, temp_csv_file
):
    # Create plot and observation
    plot = Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=1)
    Observation.objects.create(
        plot=plot,
        variable=observation_variable,
        value_numeric=88.5,
        notes="Healthy plant",
    )

    # Test writing to file
    out = StringIO()
    call_command(
        "export_trial_data",
        trial=trial.trial_code,
        output=temp_csv_file,
        stdout=out,
    )

    assert "Successfully exported data" in out.getvalue()

    with open(temp_csv_file, "r", encoding="utf-8") as f:
        content = f.read()
        assert "plot_number,germplasm_name,rep,variable_name" in content
        assert "1,Line A,1,Plant height,88.5" in content

    # Test writing to stdout
    out_stdout = StringIO()
    call_command(
        "export_trial_data",
        trial=trial.trial_code,
        stdout=out_stdout,
    )
    stdout_val = out_stdout.getvalue()
    assert "plot_number,germplasm_name,rep,variable_name" in stdout_val
    assert "1,Line A,1,Plant height,88.5" in stdout_val


@pytest.mark.django_db
def test_export_fieldbook_command(
    trial, germplasm, observation_variable, temp_csv_file
):
    Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=1)

    out = StringIO()
    call_command(
        "export_fieldbook",
        trial=trial.trial_code,
        output=temp_csv_file,
        stdout=out,
    )

    assert "Successfully exported Field Book layout" in out.getvalue()

    with open(temp_csv_file, "r", encoding="utf-8") as f:
        content = f.read()
        assert "plot_id,range,plot,entry,Plant height" in content
        assert "1,1,1,Line A," in content


@pytest.mark.django_db
def test_import_fieldbook_command(
    trial, germplasm, observation_variable, temp_csv_file
):
    plot = Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=1)

    # Prepare Field Book export content
    csv_content = "plot_id,range,plot,entry,Plant height\n" "1,1,1,Line A,92.4\n"
    with open(temp_csv_file, "w", encoding="utf-8") as f:
        f.write(csv_content)

    out = StringIO()
    call_command(
        "import_fieldbook",
        temp_csv_file,
        trial=trial.trial_code,
        stdout=out,
    )

    stdout_val = out.getvalue()
    assert "Observations Saved: 1" in stdout_val
    assert "Errors: 0" in stdout_val

    # Verify observation in DB
    assert Observation.objects.filter(plot=plot, variable=observation_variable).exists()
    obs = Observation.objects.get(plot=plot, variable=observation_variable)
    assert obs.value_numeric == 92.4
