@Library('pipeline') _

def version = '20.6000'

node ('controls') {
    checkout_pipeline("20.6000/bugfix/rename_component")
    run_branch = load '/home/sbis/jenkins_pipeline/platforma/branch/run_branch'
    run_branch.execute('wasaby_cli', version)
}