import {ChangeDetectorRef, Component, Inject, OnInit} from "@angular/core";
import {HttpClient} from "@angular/common/http";

@Component({
    template: `
        <div class="wrapper main text">

            <h1>Support</h1>

            <div class="boxes">
                <div class="box" style="margin-right: 15px;">
                    <h3>Slack</h3>

                    <p class="sub">
                        Join the Deepkit Slack community, get first hand news, and chat directly with us.
                    </p>

                    <div class="buttons">
                        <a class="button" target="_blank"
                           href="https://join.slack.com/t/deepkitcommunity/shared_invite/enQtODA5MTE0NDg5NDExLTkyZjBkZTZkYjRjZWZjMTFjYjcwNmZhZDFiNTliOWUxZmFjZWE1Y2RmNDBhNmI3MTM5NmFkZDg2YzBiNTZlNDc">
                            Join Deepkit Community Slack
                        </a>
                    </div>
                </div>

                <div class="box">
                    <h3>GitHub</h3>

                    <p class="sub">
                        You can post issues regarding the Python SDK
                        directly in our open-source Github repository.
                    </p>

                    <div class="buttons">
                        <a class="button" target="_blank" href="https://github.com/deepkit/deepkit-python-sdk">Open Python SDK Github Repository</a>
                    </div>
                </div>
            </div>

            <div class="box">
                <h3>Email</h3>

                <p class="sub">
                    You have pricing questions, wonder whether your use case is covered, or need a quote?
                </p>

                <div class="buttons">
                    <a class="button" href="mailto:info@deepkit.ai">Contact us</a>
                </div>
            </div>

            <div class="bottom">
                <p>
                    Check also <a routerLink="/documentation/faq">the FAQ</a> to see if we covered your question already.
                </p>
            </div>
        </div>
    `,
    styleUrls: [`./support-page.component.scss`]
})
export class SupportPageComponent {
}
