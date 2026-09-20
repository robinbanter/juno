import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { OnboardingArt } from "../components/art";
import { Body, Button, Display } from "../components/kit";

/**
 * Onboarding.
 *
 * One screen, one action. Get Started drops straight into the feed — it does
 * not ask for an account, because a social feed behind a login is dead on
 * arrival and the first thing anyone sees should be the product working. A
 * wallet is created later, at the moment someone actually needs one.
 */
export default function Onboarding() {
  const router = useRouter();

  return (
    <Page edges={["top", "bottom"]}>
      <Art>
        <OnboardingArt size={320} />
      </Art>

      <Copy>
        <Display>Social Trading{"\n"}Community</Display>
        <Body muted>
          Every post is a live market. Back the work you believe in, and the
          creator earns the trading fees.
        </Body>
      </Copy>

      <Button label="Get Started" tall onPress={() => router.replace("/(tabs)/social")} />
    </Page>
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
  padding-horizontal: ${(p) => p.theme.space(6)}px;
  padding-bottom: ${(p) => p.theme.space(4)}px;
`;

const Art = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const Copy = styled.View`
  gap: ${(p) => p.theme.space(3)}px;
  padding-bottom: ${(p) => p.theme.space(8)}px;
`;
